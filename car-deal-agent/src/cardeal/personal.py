"""Buying a car to keep it: is the price fair, what to offer, what it costs in the first year.

The trade view (flip.py) asks "can I resell it at a profit?"; this one asks "is it a good car
at a good price for me?". Both start from the same market price.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date

from cardeal.config import DealSettings, TripSettings
from cardeal.flip import has_real_price, hu_due_soon, trip_costs
from cardeal.i18n import euro, percent, t
from cardeal.models import FlipEstimate, Listing, Valuation
from cardeal.pipeline import engine_power
from cardeal.valuation import ad_flags

# How far below (+) or above (-) the market price an asking price is, and what that makes it.
RATINGS = ((0.15, "steal"), (0.05, "good"), (-0.05, "fair"), (-0.15, "high"))
USAGE_FACTOR = {"city": 1.15, "mixed": 1.0, "highway": 0.92}
INSPECTION_COST = 120  # independent used-car check (Gebrauchtwagencheck) before buying


@dataclass
class PersonalSettings:
    annual_km: int = 12_000
    usage: str = "mixed"  # city | mixed | highway
    max_budget: int | None = None
    petrol_price: float = 2.10
    diesel_price: float = 2.20
    lpg_price: float = 1.10
    electricity_price: float = 0.35  # € per kWh
    inspection_cost: int = INSPECTION_COST


@dataclass
class PersonalEstimate:
    priced: bool
    asking: int | None
    market: int
    discount: float | None  # 0.2 = 20 % below market
    rating: str  # steal | good | fair | high | overpriced | unknown
    offer_start: int  # first offer
    offer_max: int  # most to pay
    consumption: float  # per 100 km, estimated from fuel and power
    energy_unit: str  # "l" or "kWh"
    energy_price: float
    fuel_per_year: int
    hu_cost: int
    repairs: int  # defects named in the ad (quoted by the AI review)
    inspection_cost: int
    trip_cost: int  # fuel to fetch the car
    first_year_cost: int  # everything above on top of the price, for the first year
    score: int = 50
    verdict: str = "check"  # buy | negotiate | check | avoid
    reasons: list[str] = field(default_factory=list)


ROUND_TO = 50


def _round_to(value: float, step: int = 50) -> int:
    return int(round(value / step) * step)


def rating_for(discount: float | None) -> str:
    if discount is None:
        return "unknown"
    return next((name for threshold, name in RATINGS if discount >= threshold), "overpriced")


def estimated_consumption(listing: Listing, usage: str = "mixed") -> tuple[float, str]:
    """Rough consumption per 100 km from fuel and power (stronger engines use more), and its unit."""
    fuel = (listing.fuel_slug or listing.fuel or "").lower()
    ps = engine_power(listing)[0] or 100
    factor = USAGE_FACTOR.get(usage, 1.0)
    if "elektro" in fuel:
        return round((13 + 0.02 * ps) * factor, 1), "kWh"
    if "diesel" in fuel:
        litres = 3.6 + 0.018 * ps
    else:
        litres = 4.8 + 0.022 * ps
        if "hybrid" in fuel:
            litres *= 0.75
        elif "autogas" in fuel or "lpg" in fuel:
            litres *= 1.2  # LPG burns about a fifth more litres than petrol
    return round(litres * factor, 1), "l"


def energy_price(listing: Listing, settings: PersonalSettings) -> float:
    fuel = (listing.fuel_slug or listing.fuel or "").lower()
    if "elektro" in fuel:
        return settings.electricity_price
    if "diesel" in fuel:
        return settings.diesel_price
    if "autogas" in fuel or "lpg" in fuel:
        return settings.lpg_price
    return settings.petrol_price


def offer_range(asking: int | None, market: int, rating: str, negotiable: bool) -> tuple[int, int]:
    """(first offer, most to pay). A cheap car is worth paying quickly; an expensive one is worth
    the market price at most."""
    if asking is None:
        return _round_to(market * 0.9), int(market // ROUND_TO * ROUND_TO)
    if rating == "steal":
        start, top = asking * 0.97, asking
    elif rating == "good":
        start, top = asking * 0.93, asking
    elif rating == "fair":
        start, top = min(asking, market) * 0.90, asking
    else:  # high, overpriced: the market price is the ceiling
        start, top = market * 0.90, market
    if not negotiable:
        start = max(start, top * 0.95)  # a fixed price leaves less room
    # The ceiling is the asking price itself or the market price rounded down: rounding up would
    # tell the buyer to pay more than the market.
    ceiling = asking if top == asking else int(top // ROUND_TO * ROUND_TO)
    return min(_round_to(start), ceiling), ceiling


def estimate_personal(
    listing: Listing,
    valuation: Valuation,
    settings: PersonalSettings,
    deal: DealSettings,
    repair_costs: int = 0,
    today: date | None = None,
    trip: TripSettings | None = None,
) -> PersonalEstimate:
    today = today or date.today()
    priced = has_real_price(listing)
    market = valuation.market_price or 0
    asking = listing.price if priced else None
    discount = valuation.discount(asking) if priced and market else None
    rating = rating_for(discount)
    start, top = offer_range(asking, market, rating, listing.negotiable)
    consumption, unit = estimated_consumption(listing, settings.usage)
    price = energy_price(listing, settings)
    fuel_per_year = round(settings.annual_km / 100 * consumption * price)
    hu_cost = deal.hu_cost if hu_due_soon(listing, deal, today) else 0
    trip_cost = trip_costs(listing, trip)[0]
    first_year = repair_costs + hu_cost + settings.inspection_cost + trip_cost + fuel_per_year
    return PersonalEstimate(
        priced=priced, asking=asking, market=market, discount=discount, rating=rating,
        offer_start=start, offer_max=top, consumption=consumption, energy_unit=unit, energy_price=price,
        fuel_per_year=fuel_per_year, hu_cost=hu_cost, repairs=repair_costs,
        inspection_cost=settings.inspection_cost, trip_cost=trip_cost, first_year_cost=first_year,
    )


def decide_personal(
    listing: Listing,
    valuation: Valuation,
    estimate: PersonalEstimate,
    settings: PersonalSettings,
    deal: DealSettings,
    analysis=None,
    lang: str = "en",
) -> tuple[str, list[str], int]:
    """(verdict, reasons, score 0-100) for buying the car to keep: buy, negotiate, check or avoid."""
    flags = ad_flags(listing)
    reasons: list[str] = []
    if not estimate.priced:
        verdict = "check"
        reasons.append(t(lang, "reason_no_price"))
    elif estimate.rating in ("steal", "good", "fair"):
        verdict = "buy"
    elif estimate.rating == "high":
        verdict = "negotiate"
        reasons.append(t(lang, "reason_price_high", pct=percent(-(estimate.discount or 0)),
                         offer=euro(estimate.offer_max)))
    else:
        verdict = "avoid"
        reasons.append(t(lang, "reason_overpriced", pct=percent(-(estimate.discount or 0)),
                         offer=euro(estimate.offer_max)))

    def at_most(level: str) -> None:
        nonlocal verdict
        order = ["buy", "negotiate", "check", "avoid"]
        verdict = order[max(order.index(verdict), order.index(level))]

    if "broken" in flags:
        at_most("check")
        reasons.append(t(lang, "reason_broken"))
    if listing.damaged:
        at_most("check")
        reasons.append(t(lang, "reason_damaged"))
    if valuation.confidence == "low":
        at_most("check")
        reasons.append(t(lang, "reason_few_comparables", n=valuation.comparables))
    if estimate.discount is not None and estimate.discount >= deal.suspicious_discount:
        at_most("check")
        reasons.append(t(lang, "reason_suspicious", discount=percent(estimate.discount)))
    if settings.max_budget and estimate.asking and estimate.asking > settings.max_budget:
        at_most("negotiate")
        reasons.append(t(lang, "reason_over_budget", budget=euro(settings.max_budget)))
    if analysis is not None:
        if analysis.scam_risk == "high":
            verdict = "avoid"
            reasons.append(t(lang, "reason_scam"))
        elif analysis.verdict in ("check", "avoid", "negotiate"):
            at_most(analysis.verdict)
        if analysis.scam_risk == "medium":
            at_most("check")
        reasons.append(t(lang, "reason_ai", reason=analysis.verdict_reason))

    score = personal_score(valuation, estimate, flags, listing, analysis)
    if verdict == "avoid":
        score = min(score, 30)
    elif verdict == "check":
        score = min(score, 65)
    return verdict, reasons, score


def personal_score(valuation: Valuation, estimate: PersonalEstimate, flags: set[str], listing: Listing,
                   analysis=None) -> int:
    if estimate.discount is None:
        score = 50.0
    else:
        score = 50 + 200 * estimate.discount  # 15 % below market -> 80, at market -> 50
        if valuation.confidence == "low":
            score = 50 + (score - 50) * 0.6
    score -= 30 if "broken" in flags else 0
    score -= 20 if listing.damaged else 0
    score -= 5 if estimate.hu_cost else 0
    if analysis is not None:
        score += (getattr(analysis, "reliability", 3) - 3) * 6
        score -= 15 if analysis.scam_risk == "medium" else 0
        if analysis.scam_risk == "high":
            score = min(score, 10)
    return int(min(max(round(score), 0), 100))


def trade_score(flip: FlipEstimate, valuation: Valuation, verdict: str, deal: DealSettings, listing: Listing,
                analysis=None) -> int:
    """0-100 for buying to resell: how far the profit and ROI clear your minimums, minus the risks."""
    if not flip.priced or not valuation.market_price:
        score = 50.0
    else:
        score = (50 + 30 * math.tanh((flip.profit - deal.min_profit) / max(deal.min_profit, 300))
                 + 20 * math.tanh((flip.roi - deal.min_roi) / 0.25))
        if valuation.confidence == "low":
            score = 50 + (score - 50) * 0.7
    flags = ad_flags(listing)
    score -= 25 if "broken" in flags else 0
    score -= 15 if listing.damaged else 0
    discount = valuation.discount(listing.price) if flip.priced else None
    score -= 10 if discount is not None and discount >= deal.suspicious_discount else 0
    if analysis is not None:
        score -= 15 if analysis.scam_risk == "medium" else 0
        if analysis.scam_risk == "high":
            score = min(score, 10)
    if verdict == "skip":
        score = min(score, 40)
    elif verdict == "check":
        score = min(score, 75)
    return int(min(max(round(score), 0), 100))
