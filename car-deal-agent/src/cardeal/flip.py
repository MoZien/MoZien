"""Buy-and-resell math plus the final deal / check / skip decision."""

from __future__ import annotations

from datetime import date

from cardeal.config import DealSettings, TripSettings
from cardeal.geo import road_km, zip_of
from cardeal.i18n import percent, t
from cardeal.models import FlipEstimate, Listing, Valuation

VAT_RATE = 0.19


def months_until_hu(hu_until: str | None, today: date) -> int | None:
    """'06/2026' -> months from today until the HU (TÜV) is due; negative if overdue."""
    if not hu_until or "/" not in hu_until:
        return None
    month, year = hu_until.split("/", 1)
    if not (month.isdigit() and year.isdigit()):
        return None
    return (int(year) - today.year) * 12 + int(month) - today.month


def hu_due_soon(listing: Listing, settings: DealSettings, today: date) -> bool:
    """HU expired or due within hu_warning_months (e.g. 2: this month, next month, the one after)."""
    months = months_until_hu(listing.hu_until, today)
    return months is not None and months <= settings.hu_warning_months


def trip_costs(listing: Listing, trip: TripSettings | None) -> tuple[int, int, int]:
    """(fuel cost in €, one-way km, legs) to fetch the car from home; zeros if the distance is unknown."""
    if trip is None:
        return 0, 0, 0
    km = road_km(trip.home_zip, zip_of(listing.location), trip.road_factor)
    if km is None:
        return 0, 0, 0
    fuel = (listing.fuel_slug or listing.fuel or "").lower()
    price = next((p for kind, p in trip.fuel_prices.items() if kind in fuel), trip.fuel_prices.get("benzin", 1.75))
    legs = 2 if trip.round_trip else 1
    return round(km * legs * trip.consumption_l_per_100km / 100 * price), round(km), legs


def estimate_flip(
    listing: Listing,
    valuation: Valuation,
    settings: DealSettings,
    repair_costs: int = 0,
    today: date | None = None,
    trip: TripSettings | None = None,
) -> FlipEstimate:
    today = today or date.today()
    asking = listing.price or 0
    buy = round(asking * (1 - settings.negotiation_discount)) if listing.negotiable else asking
    resale = round((valuation.market_price or 0) * settings.resale_factor)

    hu_cost = settings.hu_cost if hu_due_soon(listing, settings, today) else 0
    fuel_cost, trip_km, trip_legs = trip_costs(listing, trip)
    other = sum(settings.fixed_costs.values()) + hu_cost + fuel_cost

    # Differenzbesteuerung (§25a UStG): VAT is 19/119 of (sale price - purchase price).
    vat = round(max(resale - buy, 0) * VAT_RATE / (1 + VAT_RATE)) if settings.vat_margin_scheme else 0
    profit = resale - buy - repair_costs - other - vat
    invested = buy + repair_costs + other

    # Highest purchase price that still leaves min_profit (with §25a the margin VAT shrinks the gain).
    needed = settings.min_profit + repair_costs + other
    if settings.vat_margin_scheme:
        needed = round(needed * (1 + VAT_RATE))
    max_buy = resale - needed
    return FlipEstimate(
        buy_price=buy,
        resale_price=resale,
        repair_costs=repair_costs,
        other_costs=other,
        vat=vat,
        profit=profit,
        roi=round(profit / invested, 3) if invested else 0.0,
        hu_cost=hu_cost,
        max_buy_price=max(max_buy, 0),
        target_profit=settings.min_profit,
        fuel_cost=fuel_cost,
        trip_km=trip_km,
        trip_legs=trip_legs,
    )


def decide(
    listing: Listing,
    valuation: Valuation,
    flip: FlipEstimate,
    settings: DealSettings,
    analysis=None,
    today: date | None = None,
    lang: str = "en",
) -> tuple[str, list[str]]:
    """Combines the numbers and the AI review into 'deal', 'check' or 'skip' with reasons."""
    today = today or date.today()
    reasons: list[str] = []
    discount = valuation.discount(listing.price) or 0.0

    if flip.profit < settings.min_profit:
        reasons.append(t(lang, "reason_profit_low", profit=flip.profit, minimum=settings.min_profit))
    if flip.roi < settings.min_roi:
        reasons.append(t(lang, "reason_roi_low", roi=percent(flip.roi), minimum=percent(settings.min_roi)))
    if reasons:
        return "skip", reasons

    verdict = "deal"
    if listing.damaged:
        # Compared with undamaged cars, a damaged one always looks cheap; the damage decides.
        verdict = "check"
        reasons.append(t(lang, "reason_damaged"))
    if valuation.confidence == "low":
        verdict = "check"
        reasons.append(t(lang, "reason_few_comparables", n=valuation.comparables))
    if discount >= settings.suspicious_discount:
        verdict = "check"
        reasons.append(t(lang, "reason_suspicious", discount=percent(discount)))

    if analysis is not None:
        if analysis.scam_risk == "high":
            return "skip", reasons + [t(lang, "reason_scam")]
        ai_reason = t(lang, "reason_ai", reason=analysis.verdict_reason)
        if analysis.verdict == "skip":
            return "skip", reasons + [ai_reason]
        if analysis.verdict == "check" or analysis.scam_risk == "medium":
            verdict = "check"
        reasons.append(ai_reason)
    return verdict, reasons
