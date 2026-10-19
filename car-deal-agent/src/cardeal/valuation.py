"""Estimates the market price of a car from comparable listings.

Method:
1. Learn how price falls with age and mileage for this segment by fitting
   log(price) = a + b * year + c * (km / 10,000) on all comparables
   (robust: one refit without points off by more than 2x). With little data
   the defaults below are used instead.
2. Take comparables close in year and mileage (widening the mileage range if
   too few), adjust each one's price to the target's year and mileage with
   those factors, and drop outliers.
3. Market price = median of the adjusted prices; the spread (IQR / median)
   and the number of comparables decide the confidence.

These are asking prices, not sale prices. The flip calculator accounts for
that with `resale_factor`.
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Sequence

from cardeal.config import ValuationSettings
from cardeal.models import Listing, Valuation

DEFAULT_YEAR_COEF = -math.log(0.92)  # one year newer: about +8 %
DEFAULT_KM_COEF = math.log(0.96)  # 10,000 km more: about -4 %
YEAR_COEF_BOUNDS = (0.0, -math.log(0.75))
KM_COEF_BOUNDS = (math.log(0.88), 0.0)
MIN_FOR_REGRESSION = 12
MIN_PLAUSIBLE_PRICE = 300  # below this it is "Tausch", "1 €" or a typo
OUTLIER_FACTOR = 2.0


def _usable(listing: Listing) -> bool:
    return (
        listing.price is not None
        and listing.price >= MIN_PLAUSIBLE_PRICE
        and listing.year is not None
        and listing.km is not None
    )


def _ols(points: Sequence[Listing]) -> tuple[float, float, float, float, float] | None:
    """Least squares on centred features. Returns (mean_log_price, b, c, mean_year, mean_km10k)."""
    years = [p.year for p in points]
    kms = [p.km / 10_000 for p in points]
    logs = [math.log(p.price) for p in points]
    my, mk, ml = statistics.fmean(years), statistics.fmean(kms), statistics.fmean(logs)
    suu = sum((y - my) ** 2 for y in years)
    svv = sum((k - mk) ** 2 for k in kms)
    suv = sum((y - my) * (k - mk) for y, k in zip(years, kms))
    sut = sum((y - my) * (t - ml) for y, t in zip(years, logs))
    svt = sum((k - mk) * (t - ml) for k, t in zip(kms, logs))
    det = suu * svv - suv**2
    if det <= 1e-9 * max(suu * svv, 1e-9):
        # All comparables from one year (or all with the same mileage): learn the factor
        # that the data does show and keep the default for the other.
        if svv > 1e-9:
            return ml, DEFAULT_YEAR_COEF, svt / svv, my, mk
        if suu > 1e-9:
            return ml, sut / suu, DEFAULT_KM_COEF, my, mk
        return None
    b = (sut * svv - svt * suv) / det
    c = (svt * suu - sut * suv) / det
    return ml, b, c, my, mk


def fit_depreciation(comps: Sequence[Listing]) -> tuple[float, float] | None:
    """Returns (year_coef, km_coef) for log price, or None if the data can't support a fit."""
    points = [c for c in comps if _usable(c)]
    if len(points) < MIN_FOR_REGRESSION:
        return None
    fit = _ols(points)
    if fit is None:
        return None
    ml, b, c, my, mk = fit
    inliers = [
        p for p in points
        if abs(math.log(p.price) - (ml + b * (p.year - my) + c * (p.km / 10_000 - mk)))
        <= math.log(OUTLIER_FACTOR)
    ]
    if len(inliers) >= MIN_FOR_REGRESSION and len(inliers) < len(points):
        fit = _ols(inliers) or fit
        _, b, c, _, _ = fit
    return min(max(b, YEAR_COEF_BOUNDS[0]), YEAR_COEF_BOUNDS[1]), min(max(c, KM_COEF_BOUNDS[0]), KM_COEF_BOUNDS[1])


def estimate_market_price(
    target: Listing, comps: Sequence[Listing], settings: ValuationSettings | None = None
) -> Valuation:
    settings = settings or ValuationSettings()
    if target.year is None or target.km is None:
        return Valuation(None, 0, None, "none", "missing year or mileage")

    pool = [c for c in comps if c.id != target.id and _usable(c)]
    coefs = fit_depreciation(pool)
    method = "regression" if coefs else "default depreciation"
    year_coef, km_coef = coefs or (DEFAULT_YEAR_COEF, DEFAULT_KM_COEF)

    # Start with cars of similar mileage; if too few, widen and let the mileage adjustment
    # carry more weight (a rare low-mileage car vs. the many high-mileage ones of its year).
    adjusted: list[float] = []
    widened = False
    for factor in (settings.km_window, settings.km_window * 2, math.inf):
        km_tolerance = max(factor * target.km, 20_000)
        window = [
            c for c in pool
            if abs(c.year - target.year) <= settings.year_window and abs(c.km - target.km) <= km_tolerance
        ]
        adjusted = [
            c.price * math.exp(year_coef * (target.year - c.year) + km_coef * (target.km - c.km) / 10_000)
            for c in window
        ]
        if adjusted:
            mid = statistics.median(adjusted)
            adjusted = [p for p in adjusted if mid / OUTLIER_FACTOR <= p <= mid * OUTLIER_FACTOR]
        if len(adjusted) >= settings.min_comparables:
            break
        widened = True
    if len(adjusted) < settings.min_comparables:
        return Valuation(None, len(adjusted), None, "none", "not enough comparables")

    market = statistics.median(adjusted)
    q1, _, q3 = statistics.quantiles(adjusted, n=4)
    spread = (q3 - q1) / market
    n = len(adjusted)
    if n >= 12 and spread <= 0.25 and not widened:
        confidence = "high"
    elif n >= 6 and spread <= 0.40:
        confidence = "medium"
    else:
        confidence = "low"
    return Valuation(int(round(market / 10) * 10), n, round(spread, 3), confidence, method)
