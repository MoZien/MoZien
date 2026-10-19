import math
import random
import statistics
from datetime import date

import pytest

from cardeal.config import ValuationSettings
from cardeal.models import Listing
from cardeal.valuation import (
    DEFAULT_KM_COEF,
    DEFAULT_YEAR_COEF,
    ad_flags,
    comparable_pool,
    estimate_market_price,
    fit_depreciation,
    local_price_factor,
    plausible_km,
    registration,
    same_car,
)


def car(i, price, year, km):
    return Listing(id=f"c{i}", source="test", url="", title="", price=price, year=year, km=km)


def true_price(year, km):
    """Synthetic market: +10 % per year newer, -5 % per 10,000 km."""
    return 10_000 * 1.10 ** (year - 2015) * 0.95 ** ((km - 100_000) / 10_000)


@pytest.fixture
def market():
    rng = random.Random(7)
    cars = []
    for i in range(60):
        year = rng.randint(2012, 2018)
        km = rng.randint(50_000, 180_000)
        cars.append(car(i, round(true_price(year, km) * rng.uniform(0.93, 1.07)), year, km))
    return cars


def test_regression_recovers_depreciation(market):
    year_coef, km_coef = fit_depreciation(market)
    assert year_coef == pytest.approx(math.log(1.10), abs=0.02)
    assert km_coef == pytest.approx(math.log(0.95), abs=0.01)


def test_market_price_close_to_truth(market):
    target = car("t", 7000, 2015, 100_000)
    valuation = estimate_market_price(target, market)
    assert valuation.method == "regression"
    assert valuation.market_price == pytest.approx(10_000, rel=0.05)
    assert valuation.confidence == "high"
    assert valuation.discount(7000) == pytest.approx(0.30, abs=0.04)


def test_outliers_do_not_move_the_price(market):
    junk = [car("one-euro", 1, 2015, 100_000), car("typo", 99_000, 2015, 100_000),
            car("defekt", 2_500, 2015, 95_000), car("no-km", 9_000, 2015, None)]
    target = car("t", 7000, 2015, 100_000)
    clean = estimate_market_price(target, market).market_price
    dirty = estimate_market_price(target, market + junk).market_price
    assert dirty == pytest.approx(clean, rel=0.03)


def test_target_is_never_its_own_comparable(market):
    target = market[0]
    valuation = estimate_market_price(target, market)
    assert valuation.comparables == len([
        c for c in market[1:]
        if abs(c.year - target.year) <= 2 and abs(c.km - target.km) <= max(0.4 * target.km, 20_000)
    ])


def test_small_market_uses_default_depreciation():
    comps = [car(i, 8_000 + 100 * i, 2015, 100_000 + 1_000 * i) for i in range(6)]
    valuation = estimate_market_price(car("t", 6_000, 2016, 100_000), comps)
    assert valuation.method == "default depreciation"
    assert valuation.confidence in {"medium", "low"}
    expected = 8_250 * math.exp(DEFAULT_YEAR_COEF + DEFAULT_KM_COEF * -0.25)
    assert valuation.market_price == pytest.approx(expected, rel=0.03)


def test_not_enough_comparables():
    comps = [car(i, 8_000, 2015, 100_000) for i in range(3)]
    valuation = estimate_market_price(car("t", 6_000, 2015, 100_000), comps, ValuationSettings(min_comparables=5))
    assert valuation.market_price is None
    assert valuation.confidence == "none"


def test_missing_year_or_km():
    valuation = estimate_market_price(car("t", 6_000, None, 100_000), [])
    assert valuation.market_price is None
    assert valuation.method == "missing year or mileage"


def test_rare_low_mileage_car_is_valued_against_adjusted_high_mileage_ones():
    # A 2008 car with 114,000 km while all comparables have 190,000-260,000 km.
    rng = random.Random(1)
    comps = []
    for i in range(30):
        km = rng.randint(190_000, 260_000)
        comps.append(car(i, round(true_price(2008, km)), 2008, km))
    valuation = estimate_market_price(car("t", 3_000, 2008, 114_000), comps)
    assert valuation.market_price == pytest.approx(true_price(2008, 114_000), rel=0.08)
    assert valuation.confidence != "high"  # mileage range had to be widened


TODAY = date(2026, 10, 19)


def ad(ad_id, title="VW Golf", description="", price=5_000, year=2015, km=100_000, month=None, location=""):
    return Listing(id=ad_id, source="test", url=f"https://k/{ad_id}", title=title, description=description,
                   price=price, year=year, month=month, km=km, location=location)


@pytest.mark.parametrize("title, description, flags", [
    ("VW Polo 9N Für Bastler / Export / Schrauber – Ohne TÜV", "", {"broken", "no_tuv"}),
    ("vw fox bj 2011 1.2 komplett oder Teile", "", {"broken"}),
    ("VW Fox 1.2 – fahrbereit – HU-Mängelbericht", "", {"defect"}),
    ("BMW 118 Benzin 2,0 L KEIN TÜV mehr", "", {"no_tuv"}),
    ("Ford Focus", "Motor läuft, TüV im juli abgelaufen", {"no_tuv"}),
    ("VW Tiguan", "Verkaufe ihn an Bastler da die Steuerkette abgesprungen ist", {"broken"}),
    ("Mini Cooper", "Bekannte Mängel: springt nicht zuverlässig an", {"broken"}),
    ("Leasingübernahme Golf 7", "", {"not_its_price"}),
    ("Ford focus 1.6 tausche gegen mehr Ps", "", {"no_offer"}),
    # what sellers of good cars write
    ("VW Golf 5 unfallfrei, TÜV neu ohne Mängel", "Keine Händler, kein Export. Viele neue Teile.", set()),
    ("Ford Focus mk3 1.6 Motor", "Motor läuft super, Steuerkette neu", set()),
    ("Renault Modus", "Verkauf, weil wir einen guten Leasing Vertrag bekommen haben", set()),
])
def test_what_the_ad_says_about_itself(title, description, flags):
    assert ad_flags(ad("x", title, description)) == flags


def test_comparables_without_a_fair_price_or_with_a_typo_mileage_are_left_out(market):
    target = car("t", 7000, 2015, 100_000)
    junk = [
        car("typo-km", 990, 2015, 1_360_000),  # 136,000 typed with one zero too many
        car("short-km", 9_500, 2015, 114),  # 114 meant as 114,000
        ad("bastler", "Golf für Bastler", price=3_000),
        ad("no-tuv", "Golf 1.4", "Leider kein TÜV mehr", price=4_000, km=95_000),
        ad("leasing", "Leasingübernahme Golf", price=2_000),
    ]
    clean = estimate_market_price(target, market, today=TODAY)
    dirty = estimate_market_price(target, market + junk, today=TODAY)
    assert (dirty.market_price, dirty.comparables, dirty.km_effect) == (clean.market_price, clean.comparables,
                                                                         clean.km_effect)


def test_the_same_car_counts_once_and_never_as_its_own_comparable():
    target = ad("t", price=1_699, year=2003, month=7, km=165_907, location="02779 Großschönau")
    twin = ad("t2", price=1_799, year=2003, month=6, km=165_907, location="02779 Großschönau")  # posted again
    first = ad("a", price=1_100, year=2004, month=8, km=123_000, location="12526 Berlin")
    again = ad("b", price=1_100, year=2004, month=8, km=120_000, location="12526 Berlin")  # km updated
    other = ad("c", price=1_900, year=2003, month=3, km=165_000, location="01705 Freital")
    assert [c.id for c in comparable_pool(target, [twin, first, again, other], TODAY)] == ["a", "c"]
    assert not same_car(ad("x", km=150_000, location="80331 München"), ad("y", km=150_000, location="06108 Halle"))


def test_cabrios_are_no_comparables_for_a_hatchback():
    comps = [ad(f"h{i}", "BMW 118i E87", km=100_000 + i) for i in range(4)]
    comps += [ad("c1", "BMW 118i Cabrio"), ad("c2", "Peugeot 307 CC"), ad("c3", "Astra TwinTop")]
    assert [c.id for c in comparable_pool(ad("t", "BMW 118i Facelift"), comps, TODAY)] == ["h0", "h1", "h2", "h3"]
    assert len(comparable_pool(ad("t", "BMW 118i Cabrio M-Paket"), comps, TODAY)) == len(comps)


def test_the_registration_month_counts_not_only_the_year():
    assert registration(ad("x", year=2010, month=7)) == pytest.approx(2010.5)
    comps = [ad(f"c{i}", price=5_000, year=2014, month=1, km=100_000 + i) for i in range(6)]
    december = estimate_market_price(ad("t", year=2013, month=12), comps, today=TODAY)
    assert december.market_price == pytest.approx(5_000 * math.exp(-DEFAULT_YEAR_COEF / 12), abs=10)


def test_without_mileage_spread_the_typical_km_factor_stays():
    comps = [car(i, round(true_price(2012 + i % 5, 100_000)), 2012 + i % 5, 100_000) for i in range(15)]
    year_coef, km_coef = fit_depreciation(comps)
    assert km_coef == pytest.approx(DEFAULT_KM_COEF)
    assert year_coef == pytest.approx(math.log(1.10), abs=0.01)


def test_mileage_that_cannot_be_right():
    assert not plausible_km(car("x", 3_200, 2007, 114), TODAY)
    assert not plausible_km(car("x", 990, 2007, 1_360_000), TODAY)
    assert plausible_km(car("new", 30_000, 2026, 10), TODAY)  # a new car may have 10 km
    valuation = estimate_market_price(car("t", 3_200, 2007, 114), [car(i, 3_000, 2007, 120_000 + i) for i in range(8)],
                                      today=TODAY)
    assert (valuation.market_price, valuation.method) == (None, "implausible mileage")


def test_valuation_shows_the_comparables_it_used(market):
    valuation = estimate_market_price(car("t", 7000, 2015, 100_000), market, today=TODAY)
    assert len(valuation.used) == valuation.comparables
    assert statistics.median(c.adjusted for c in valuation.used) == pytest.approx(valuation.market_price, abs=10)
    closeness = [abs(c.km - 100_000) / 10_000 + abs(c.year - 2015) for c in valuation.used]
    assert closeness == sorted(closeness)  # nearest first
    assert valuation.year_effect == pytest.approx(0.10, abs=0.02)
    assert valuation.km_effect == pytest.approx(-0.05, abs=0.01)


def test_local_price_level_from_comparable_searches():
    # The same cars, but within 150 km of Halle they are offered 10 % cheaper.
    rng = random.Random(2)
    groups = [
        [ad(f"{g}-{i}", price=round(5_000 * (0.9 if i % 4 == 0 else 1.0) * rng.uniform(0.9, 1.1)), km=100_000 + i,
            location="04109 Leipzig" if i % 4 == 0 else "80331 München") for i in range(40)]
        for g in range(6)
    ]
    factor, local_ads = local_price_factor(groups, "06108", 150, TODAY)
    assert local_ads == 60
    assert 0.88 < factor < 0.95  # most of the 10 %, pulled a little towards 1
    assert local_price_factor(groups[:1], "06108", 150, TODAY) is None  # 10 local ads: too few to tell
