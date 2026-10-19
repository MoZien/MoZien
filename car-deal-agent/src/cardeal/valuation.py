"""Estimates the market price of a car from comparable listings.

Method:
1. Clean the comparables (`comparable_pool`): drop ads whose price is no fair price for a
   running car of this model ("Bastler", "Export", "ohne TÜV", parts, leasing, wanted ads),
   mileages that can't be right (1,360,000 km typed for 136,000; 114 km meant as 114,000),
   and repeats of the same car (posted twice, or the car being valued under another ad).
2. Learn how the price falls with age and mileage in this segment: least squares on
   log(price) = a + b * registration date + c * km / 10,000, pulled towards typical values
   (-8 % per year, -4 % per 10,000 km) the more the prices scatter and the fewer there are,
   with one refit without points off by more than 2x. With little data the typical values
   are used as they are.
3. Take comparables close in mileage (widening the range if too few), adjust each one's
   price to the target's registration date and mileage, and drop outliers.
4. Market price = median of the adjusted prices; the spread (IQR / median) and the number
   of comparables decide the confidence.
5. Comparables come from all of Germany, cars are resold around home: the pipeline adjusts
   the market price to the price level there (`local_price_factor`).

These are asking prices, not sale prices. The flip calculator accounts for that with
`resale_factor`.
"""

from __future__ import annotations

import math
import re
import statistics
from collections.abc import Sequence
from datetime import date

from cardeal.config import ValuationSettings
from cardeal.geo import road_km, zip_of
from cardeal.models import Comparable, Listing, Valuation

DEFAULT_YEAR_COEF = -math.log(0.92)  # one year newer: about +8 %
DEFAULT_KM_COEF = math.log(0.96)  # 10,000 km more: about -4 %
# A car never gains value with age or mileage: one year newer is worth +2 to +25 %, 10,000 km
# more cost 1 to 10 %, whatever a small or odd sample says.
YEAR_COEF_BOUNDS = (math.log(1.02), math.log(1.25))
KM_COEF_BOUNDS = (math.log(0.90), math.log(0.99))
# How far the typical values may be off (log scale); the fit only moves away from them as
# far as the data supports it.
PRIOR_SD_YEAR = 0.05
PRIOR_SD_KM = 0.02
MIN_RESIDUAL_SD = 0.05
MIN_FOR_REGRESSION = 12
MIN_PLAUSIBLE_PRICE = 300  # below this it is "Tausch", "1 €" or a typo
MAX_PLAUSIBLE_KM = 600_000
OUTLIER_FACTOR = 2.0
# Regional price level: needs this many ads on both sides; regions rarely differ by more than ±10 %.
LOCAL_MIN_ADS = 20
LOCAL_PRIOR_SD = 0.05
LOCAL_FACTOR_BOUNDS = (0.85, 1.10)

# What an ad says about itself, checked in the title and the ad text ("anywhere") or only in
# the title, where words like "Unfall", "Mängel" or "Teile" are unambiguous (an ad text says
# "unfallfrei", "keine Mängel", "viele neue Teile").
# A negation right before ("kein Export", "keine Bastler") doesn't count.
_FLAGS = {
    # Not a running car, or one you only get rid of: valued like a running one it looks cheap.
    "broken": (
        (r"bast(?:e)?l|schrauber|export|motorschaden|getriebeschaden|teileträger|teilespender|teilefahrzeug"
         r"|schlachtfest|ausschlacht|\bnicht\s+(?:mehr\s+)?(?:fahrbereit|fahrtüchtig|fahrfähig)|springt\s+nicht"),
        (r"\b(?:oder|als|in|für|fuer|fur)\s+teile\b|\bteile\s*$|ersatzteil|\bohne\s+(?:motor|getriebe)\b"
         r"|fährt\s+nicht"),
    ),
    "no_tuv": (
        (r"\b(?:ohne|kein|keine|keinen)\s*(?:tüv|tuv|tuev|hu)\b"
         r"|\b(?:tüv|tuv|tuev|hu)\b(?:\W+\w+){0,3}?\W+(?:abgelaufen|überfällig)"),
        None,
    ),
    # The price is a rate, a deposit or a leasing take-over, not what the car costs.
    "not_its_price": (r"leasing\s*übernahme|mietkauf|ratenkauf", r"leasing|anzahlung|monatlich|\bmtl\b"),
    "defect": (None, r"defekt|\bunfall(?!frei)|schaden(?!s?frei)|mängel(?!frei)"),
    # Wanted ads, dealers buying, swaps.
    "no_offer": (None, r"ankauf|wir\s+kaufen|\bkaufe\b|\bsuche\b|\btausche\b|\b(?:an|für|fuer|fur)\s+händler"),
}
_PATTERNS = {
    flag: tuple(re.compile(p, re.IGNORECASE) if p else None for p in patterns) for flag, patterns in _FLAGS.items()
}
_NEGATED = re.compile(r"\b(?:kein|keine|keinen|keiner|ohne|nicht|nichts)\b\W*(?:\w+\W+)?$", re.IGNORECASE)


def _mentions(pattern: re.Pattern | None, text: str) -> bool:
    if pattern is None:
        return False
    return any(not _NEGATED.search(text[max(0, m.start() - 25):m.start()]) for m in pattern.finditer(text or ""))


def ad_flags(listing: Listing) -> set[str]:
    """What the ad says about the car: "broken" (Bastler, Export, Motorschaden, parts ...),
    "no_tuv", "not_its_price" (leasing, rates), "defect" or "no_offer" (wanted, dealer buys)."""
    return {
        flag for flag, (anywhere, title_only) in _PATTERNS.items()
        if _mentions(anywhere, listing.title) or _mentions(anywhere, listing.description)
        or _mentions(title_only, listing.title)
    }


def no_fair_price(listing: Listing) -> bool:
    """True if the ad's price isn't what a running, roadworthy car of its model costs."""
    return bool(ad_flags(listing))


def registration(listing: Listing) -> float:
    """First registration as a fractional year: 07/2010 -> 2010.5 (month unknown: mid-year)."""
    return listing.year + ((listing.month or 7) - 1) / 12


def plausible_km(listing: Listing, today: date | None = None) -> bool:
    """False for mileages that can't be right: more than 600,000 km, or under 1,000 km on a
    car older than two years (usually 114 typed for 114,000)."""
    if listing.km is None or listing.year is None or listing.km > MAX_PLAUSIBLE_KM:
        return False
    return listing.km >= 1_000 or (today or date.today()).year - listing.year < 2


def _usable(listing: Listing, today: date | None = None) -> bool:
    return (
        listing.price is not None
        and listing.price >= MIN_PLAUSIBLE_PRICE
        and listing.year is not None
        and plausible_km(listing, today)
    )


def _zip(listing: Listing) -> str:
    match = re.match(r"\s*(\d{5})\b", listing.location or "")
    return match.group(1) if match else ""


def same_car(a: Listing, b: Listing) -> bool:
    """Two ads for the same car (posted twice, or again with price or km updated): the same
    exact mileage, or from the same place with the same first registration and a mileage
    within 3 % (10 % at the same price)."""
    if a.year != b.year or a.km is None or b.km is None:
        return False
    if a.km == b.km and a.km % 1_000:  # an exact, non-round mileage is a fingerprint
        return True
    if (a.month and b.month and a.month != b.month) or not _zip(a) or _zip(a) != _zip(b):
        return False
    km_gap = abs(a.km - b.km) / max(a.km, b.km, 1)
    return km_gap <= 0.03 or (a.price == b.price and km_gap <= 0.10)


_CONVERTIBLE = re.compile(r"cabrio|roadster|\bcc\b|twin\s*top", re.IGNORECASE)


def convertible(listing: Listing) -> bool:
    """A cabrio version of the model (Golf Cabrio, 118i Cabrio, 307 CC): a car of its own price."""
    return (
        bool(_CONVERTIBLE.search(listing.title or ""))
        or listing.body_slug == "cabrio"
        or "cabrio" in (listing.body_type or "").lower()
    )


def comparable_pool(target: Listing, comps: Sequence[Listing], today: date | None = None) -> list[Listing]:
    """The comparables that can be used for `target`: real prices of running cars with a
    plausible mileage, each car once and never the target itself; no cabrios for a car that isn't one."""
    pool: list[Listing] = []
    target_is_convertible = convertible(target)
    for comp in comps:
        if comp.id == target.id or not _usable(comp, today) or no_fair_price(comp) or same_car(comp, target):
            continue
        if convertible(comp) and not target_is_convertible:
            continue
        if not any(same_car(comp, kept) for kept in pool):
            pool.append(comp)
    return pool


def _fit(points: Sequence[Listing], residual_sd: float) -> tuple[float, float, float, float, float]:
    """Least squares on centred features, pulled towards the default factors (ridge): the
    noisier and fewer the prices, the closer it stays to them.
    Returns (mean_log_price, b, c, mean_registration, mean_km10k)."""
    ts = [registration(p) for p in points]
    ks = [p.km / 10_000 for p in points]
    ys = [math.log(p.price) for p in points]
    mt, mk, my = statistics.fmean(ts), statistics.fmean(ks), statistics.fmean(ys)
    stt = sum((t - mt) ** 2 for t in ts) + (residual_sd / PRIOR_SD_YEAR) ** 2
    skk = sum((k - mk) ** 2 for k in ks) + (residual_sd / PRIOR_SD_KM) ** 2
    stk = sum((t - mt) * (k - mk) for t, k in zip(ts, ks))
    sty = sum((t - mt) * (y - my) for t, y in zip(ts, ys)) + (residual_sd / PRIOR_SD_YEAR) ** 2 * DEFAULT_YEAR_COEF
    sky = sum((k - mk) * (y - my) for k, y in zip(ks, ys)) + (residual_sd / PRIOR_SD_KM) ** 2 * DEFAULT_KM_COEF
    det = stt * skk - stk**2  # > 0: the prior terms keep the system solvable
    b = (sty * skk - sky * stk) / det
    c = (sky * stt - sty * stk) / det
    return my, b, c, mt, mk


def _residuals(points: Sequence[Listing], fit: tuple[float, float, float, float, float]) -> list[float]:
    my, b, c, mt, mk = fit
    return [math.log(p.price) - (my + b * (registration(p) - mt) + c * (p.km / 10_000 - mk)) for p in points]


def fit_depreciation(comps: Sequence[Listing]) -> tuple[float, float] | None:
    """Returns (year_coef, km_coef) for log price, or None if there are too few comparables.
    Expects cleaned comparables (see `comparable_pool`)."""
    points = [c for c in comps if c.price and c.year is not None and c.km is not None]
    if len(points) < MIN_FOR_REGRESSION:
        return None
    fit = _fit(points, residual_sd=0.25)
    residuals = _residuals(points, fit)
    inliers = [p for p, r in zip(points, residuals) if abs(r) <= math.log(OUTLIER_FACTOR)]
    if len(inliers) >= MIN_FOR_REGRESSION:
        kept = [r for r in residuals if abs(r) <= math.log(OUTLIER_FACTOR)]
        sd = max(math.sqrt(sum(r * r for r in kept) / max(len(kept) - 3, 1)), MIN_RESIDUAL_SD)
        fit = _fit(inliers, residual_sd=sd)
    _, b, c, _, _ = fit
    return min(max(b, YEAR_COEF_BOUNDS[0]), YEAR_COEF_BOUNDS[1]), min(max(c, KM_COEF_BOUNDS[0]), KM_COEF_BOUNDS[1])


def local_price_factor(
    groups: Sequence[Sequence[Listing]], home_zip: str, radius_km: float, today: date | None = None
) -> tuple[float, int] | None:
    """How asking prices within `radius_km` of `home_zip` compare with the rest of Germany,
    learned from comparable searches: (factor, local ads), e.g. (0.95, 133) = 5 % cheaper here.
    Each ad is compared with the median of its own search after the default age and mileage
    adjustment, so the mix of models doesn't matter; the fewer local ads, the closer to 1."""
    seen: set[str] = set()
    local: list[float] = []
    rest: list[float] = []
    for comps in groups:
        pool = [c for c in comps if _usable(c, today) and not no_fair_price(c)]
        if len(pool) < 8:
            continue
        levels = [
            math.log(c.price) - DEFAULT_YEAR_COEF * registration(c) - DEFAULT_KM_COEF * c.km / 10_000 for c in pool
        ]
        middle = statistics.median(levels)
        for comp, level in zip(pool, levels):
            distance = road_km(home_zip, zip_of(comp.location), road_factor=1.0)
            if comp.id in seen or distance is None:
                continue
            seen.add(comp.id)
            (local if distance <= radius_km else rest).append(level - middle)
    if len(local) < LOCAL_MIN_ADS or len(rest) < LOCAL_MIN_ADS:
        return None
    gap = statistics.median(local) - statistics.median(rest)
    # A median of n prices scattering by sd is about as precise as a mean of n / 1.57.
    precision = len(local) / (1.57 * max(statistics.pstdev(local + rest), 0.1) ** 2)
    weight = precision / (precision + 1 / LOCAL_PRIOR_SD**2)
    factor = min(max(math.exp(weight * gap), LOCAL_FACTOR_BOUNDS[0]), LOCAL_FACTOR_BOUNDS[1])
    return round(factor, 3), len(local)


def estimate_market_price(
    target: Listing,
    comps: Sequence[Listing],
    settings: ValuationSettings | None = None,
    today: date | None = None,
) -> Valuation:
    settings = settings or ValuationSettings()
    if target.year is None or target.km is None:
        return Valuation(None, 0, None, "none", "missing year or mileage")
    if not plausible_km(target, today):
        return Valuation(None, 0, None, "none", "implausible mileage")

    pool = comparable_pool(target, comps, today)
    coefs = fit_depreciation(pool)
    method = "regression" if coefs else "default depreciation"
    year_coef, km_coef = coefs or (DEFAULT_YEAR_COEF, DEFAULT_KM_COEF)
    when = registration(target)

    # Start with cars of similar mileage; if too few, widen and let the mileage adjustment
    # carry more weight (a rare low-mileage car vs. the many high-mileage ones of its year).
    # A car whose price would have to be more than halved or doubled is no comparable.
    used: list[tuple[Listing, float]] = []
    widened = False
    for factor in (settings.km_window, settings.km_window * 2, math.inf):
        km_tolerance = max(factor * target.km, 20_000)
        used = []
        for comp in pool:
            if abs(comp.year - target.year) > settings.year_window or abs(comp.km - target.km) > km_tolerance:
                continue
            adjustment = math.exp(year_coef * (when - registration(comp)) + km_coef * (target.km - comp.km) / 10_000)
            if 1 / OUTLIER_FACTOR <= adjustment <= OUTLIER_FACTOR:
                used.append((comp, comp.price * adjustment))
        if used:
            mid = statistics.median(price for _, price in used)
            used = [(c, p) for c, p in used if mid / OUTLIER_FACTOR <= p <= mid * OUTLIER_FACTOR]
        if len(used) >= settings.min_comparables:
            break
        widened = True
    if len(used) < settings.min_comparables:
        return Valuation(None, len(used), None, "none", "not enough comparables")

    prices = [price for _, price in used]
    market = statistics.median(prices)
    q1, _, q3 = statistics.quantiles(prices, n=4)
    spread = (q3 - q1) / market
    n = len(prices)
    if n >= 12 and spread <= 0.25 and not widened:
        confidence = "high"
    elif n >= 8 and spread <= 0.40:
        confidence = "medium"
    else:
        confidence = "low"  # the median of a handful of asking prices is no market price yet
    return Valuation(
        int(round(market / 10) * 10), n, round(spread, 3), confidence, method,
        year_effect=round(math.exp(year_coef) - 1, 3), km_effect=round(math.exp(km_coef) - 1, 3),
        used=[
            Comparable(c.url, c.title, c.price, round(p), c.km, c.year, c.month, c.location)
            for c, p in sorted(used, key=lambda cp: abs(cp[0].km - target.km) / 10_000 + abs(registration(cp[0]) - when))
        ],
    )
