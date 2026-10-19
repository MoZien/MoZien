"""Buy-and-resell math plus the final deal / check / skip decision."""

from __future__ import annotations

from datetime import date

from cardeal.config import DealSettings, TripSettings
from cardeal.geo import road_km, zip_of
from cardeal.i18n import percent, t
from cardeal.models import FlipEstimate, Listing, Valuation
from cardeal.valuation import MIN_PLAUSIBLE_PRICE, ad_flags

VAT_RATE = 0.19


def has_real_price(listing: Listing) -> bool:
    """False for "VB" without an amount, "1 €"-style placeholders, rates and leasing take-overs."""
    return (
        listing.price is not None
        and listing.price >= MIN_PLAUSIBLE_PRICE
        and "not_its_price" not in ad_flags(listing)
    )


def months_until_hu(hu_until: str | None, today: date) -> int | None:
    """'06/2026' -> months from today until the HU (TÜV) is due; negative if overdue."""
    if not hu_until or "/" not in hu_until:
        return None
    month, year = hu_until.split("/", 1)
    if not (month.isdigit() and year.isdigit()):
        return None
    return (int(year) - today.year) * 12 + int(month) - today.month


def hu_due_soon(listing: Listing, settings: DealSettings, today: date) -> bool:
    """HU expired or due within hu_warning_months (e.g. 2: this month, next month, the one after),
    or no HU date and the ad says "ohne TÜV" / "TÜV abgelaufen"."""
    months = months_until_hu(listing.hu_until, today)
    if months is None:
        return "no_tuv" in ad_flags(listing)
    return months <= settings.hu_warning_months


def trip_costs(listing: Listing, trip: TripSettings | None) -> tuple[int, int, int, float]:
    """(fuel cost in €, one-way km, legs, € per litre) to fetch the car from home; zeros if the
    distance is unknown."""
    if trip is None:
        return 0, 0, 0, 0.0
    km = road_km(trip.home_zip, zip_of(listing.location), trip.road_factor)
    if km is None:
        return 0, 0, 0, 0.0
    fuel = (listing.fuel_slug or listing.fuel or "").lower()
    price = next((p for kind, p in trip.fuel_prices.items() if kind in fuel), trip.fuel_prices.get("benzin", 2.10))
    legs = 2 if trip.round_trip else 1
    return round(round(km) * legs * trip.consumption_l_per_100km / 100 * price), round(km), legs, price


def estimate_flip(
    listing: Listing,
    valuation: Valuation,
    settings: DealSettings,
    repair_costs: int = 0,
    today: date | None = None,
    trip: TripSettings | None = None,
) -> FlipEstimate:
    today = today or date.today()
    priced = has_real_price(listing)
    asking = listing.price if priced else 0
    buy = round(asking * (1 - settings.negotiation_discount)) if listing.negotiable else asking
    resale = round((valuation.market_price or 0) * settings.resale_factor)

    hu_cost = settings.hu_cost if hu_due_soon(listing, settings, today) else 0
    fuel_cost, trip_km, trip_legs, fuel_price = trip_costs(listing, trip)
    other = sum(settings.fixed_costs.values()) + hu_cost + fuel_cost

    # Differenzbesteuerung (§25a UStG): VAT is 19/119 of (sale price - purchase price).
    vat = round(max(resale - buy, 0) * VAT_RATE / (1 + VAT_RATE)) if settings.vat_margin_scheme and priced else 0
    profit = resale - buy - repair_costs - other - vat if priced else 0
    invested = buy + repair_costs + other

    # Highest purchase price that still leaves min_profit. With §25a the margin VAT takes
    # 19/119 of (resale - buy), so: (resale - buy) * 100/119 - repairs - other = min_profit.
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
        roi=round(profit / invested, 3) if invested and priced else 0.0,
        hu_cost=hu_cost,
        max_buy_price=max(max_buy, 0),
        target_profit=settings.min_profit,
        fuel_cost=fuel_cost,
        trip_km=trip_km,
        trip_legs=trip_legs,
        priced=priced,
        fuel_price=fuel_price,
        consumption=trip.consumption_l_per_100km if fuel_cost and trip else 0.0,
        resale_factor=settings.resale_factor,
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

    if not flip.priced:
        # Nothing to compare with: the market price only says what to offer.
        verdict, discount = "check", 0.0
        reasons.append(t(lang, "reason_no_price"))
    else:
        if flip.profit < settings.min_profit:
            reasons.append(t(lang, "reason_profit_low", profit=flip.profit, minimum=settings.min_profit))
        if flip.roi < settings.min_roi:
            reasons.append(t(lang, "reason_roi_low", roi=percent(flip.roi), minimum=percent(settings.min_roi)))
        if reasons:
            return "skip", reasons
        verdict, discount = "deal", valuation.discount(listing.price) or 0.0

    if "broken" in ad_flags(listing):
        # Valued like a running car it looks cheap; what the repair costs is unknown.
        verdict = "check"
        reasons.append(t(lang, "reason_broken"))
    if listing.damaged:
        # Compared with undamaged cars, a damaged one always looks cheap; the damage decides.
        verdict = "check"
        reasons.append(t(lang, "reason_damaged"))
    if valuation.confidence == "low":
        verdict = "check"
        if valuation.power_as_kw:
            reasons.append(t(lang, "reason_power_kw", ps=listing.power_ps))
        elif valuation.comparables < 8 or valuation.spread is None:
            reasons.append(t(lang, "reason_few_comparables", n=valuation.comparables))
        else:
            reasons.append(t(lang, "reason_wide_spread", spread=percent(valuation.spread / 2)))
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
