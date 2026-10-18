"""Buy-and-resell math plus the final deal / check / skip decision."""

from __future__ import annotations

from datetime import date

from cardeal.config import DealSettings
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
    months = months_until_hu(listing.hu_until, today)
    return months is not None and months < settings.hu_warning_months


def estimate_flip(
    listing: Listing,
    valuation: Valuation,
    settings: DealSettings,
    repair_costs: int = 0,
    today: date | None = None,
) -> FlipEstimate:
    today = today or date.today()
    asking = listing.price or 0
    buy = round(asking * (1 - settings.negotiation_discount)) if listing.negotiable else asking
    resale = round((valuation.market_price or 0) * settings.resale_factor)

    other = sum(settings.fixed_costs.values())
    if hu_due_soon(listing, settings, today):
        other += settings.hu_cost

    # Differenzbesteuerung (§25a UStG): VAT is 19/119 of (sale price - purchase price).
    vat = round(max(resale - buy, 0) * VAT_RATE / (1 + VAT_RATE)) if settings.vat_margin_scheme else 0
    profit = resale - buy - repair_costs - other - vat
    invested = buy + repair_costs + other
    return FlipEstimate(
        buy_price=buy,
        resale_price=resale,
        repair_costs=repair_costs,
        other_costs=other,
        vat=vat,
        profit=profit,
        roi=round(profit / invested, 3) if invested else 0.0,
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
    if valuation.confidence == "low":
        verdict = "check"
        reasons.append(t(lang, "reason_few_comparables", n=valuation.comparables))
    if discount >= settings.suspicious_discount:
        verdict = "check"
        reasons.append(t(lang, "reason_suspicious", discount=percent(discount)))
    if hu_due_soon(listing, settings, today):
        reasons.append(t(lang, "reason_hu_due", hu=listing.hu_until))

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
