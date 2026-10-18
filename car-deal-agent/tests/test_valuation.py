import math
import random

import pytest

from cardeal.config import ValuationSettings
from cardeal.models import Listing
from cardeal.valuation import DEFAULT_KM_COEF, DEFAULT_YEAR_COEF, estimate_market_price, fit_depreciation


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
