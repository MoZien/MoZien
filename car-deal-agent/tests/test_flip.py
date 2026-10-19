from datetime import date

import pytest
from helpers import make_analysis as analysis

from cardeal.config import DealSettings
from cardeal.flip import decide, estimate_flip, months_until_hu
from cardeal.models import Listing, Valuation

TODAY = date(2026, 10, 18)


def listing(price=6000, negotiable=False, hu=None):
    return Listing(id="a", source="t", url="", title="", price=price, negotiable=negotiable,
                   year=2015, km=100_000, hu_until=hu)


def valuation(market=9000, confidence="high", n=15):
    return Valuation(market, n, 0.15, confidence, "regression")


SETTINGS = DealSettings(fixed_costs={"registration": 120, "transport": 100, "cleaning": 150})


def test_flip_basic_numbers():
    flip = estimate_flip(listing(6000), valuation(9000), SETTINGS, today=TODAY)
    assert flip.buy_price == 6000
    assert flip.resale_price == 8550  # 95 % of market
    assert flip.other_costs == 370
    assert flip.profit == 8550 - 6000 - 370
    assert flip.roi == pytest.approx(2180 / 6370, abs=0.001)


def test_negotiable_price_assumes_discount_and_repairs_reduce_profit():
    flip = estimate_flip(listing(6000, negotiable=True), valuation(9000), SETTINGS, repair_costs=500, today=TODAY)
    assert flip.buy_price == 5700
    assert flip.profit == 8550 - 5700 - 500 - 370


def test_hu_due_adds_cost():
    soon = estimate_flip(listing(hu="12/2026"), valuation(), SETTINGS, today=TODAY)
    later = estimate_flip(listing(hu="10/2028"), valuation(), SETTINGS, today=TODAY)
    assert soon.other_costs - later.other_costs == SETTINGS.hu_cost
    assert (soon.hu_cost, later.hu_cost) == (SETTINGS.hu_cost, 0)
    assert months_until_hu("03/2026", TODAY) == -7
    assert months_until_hu("bald", TODAY) is None


def test_margin_scheme_vat():
    settings = DealSettings(fixed_costs={}, vat_margin_scheme=True)
    flip = estimate_flip(listing(6000), valuation(9000), settings, today=TODAY)
    assert flip.vat == round((8550 - 6000) * 0.19 / 1.19)
    assert flip.profit == 8550 - 6000 - flip.vat


def test_decide_deal_check_skip():
    good = listing(6000)
    val = valuation(9000)
    flip = estimate_flip(good, val, SETTINGS, today=TODAY)

    assert decide(good, val, flip, SETTINGS, analysis(), TODAY)[0] == "deal"
    assert decide(good, val, flip, SETTINGS, analysis(verdict="check"), TODAY)[0] == "check"
    assert decide(good, val, flip, SETTINGS, analysis(scam_risk="medium"), TODAY)[0] == "check"
    assert decide(good, val, flip, SETTINGS, analysis(scam_risk="high"), TODAY)[0] == "skip"
    assert decide(good, val, flip, SETTINGS, analysis(verdict="skip"), TODAY)[0] == "skip"
    assert decide(good, valuation(9000, "low", 5), flip, SETTINGS, None, TODAY)[0] == "check"


def test_decide_skips_unprofitable_and_flags_too_cheap():
    pricey = listing(8500)
    val = valuation(9000)
    verdict, reasons = decide(pricey, val, estimate_flip(pricey, val, SETTINGS, today=TODAY), SETTINGS, today=TODAY)
    assert verdict == "skip" and "profit" in reasons[0]

    too_cheap = listing(4000)
    verdict, reasons = decide(too_cheap, val, estimate_flip(too_cheap, val, SETTINGS, today=TODAY), SETTINGS,
                              today=TODAY)
    assert verdict == "check"
    assert any("56 %" in r for r in reasons)


def test_reasons_are_localised():
    pricey = listing(8500)
    val = valuation(9000)
    flip = estimate_flip(pricey, val, SETTINGS, today=TODAY)
    _, reasons = decide(pricey, val, flip, SETTINGS, today=TODAY, lang="ar")
    assert reasons[0].startswith("الربح")


def test_max_purchase_price_keeps_the_minimum_profit():
    settings = DealSettings(fixed_costs={"registration": 120, "transport": 100, "cleaning": 150}, min_profit=500)
    flip = estimate_flip(listing(6000), valuation(9000), settings, repair_costs=300, today=TODAY)
    assert flip.max_buy_price == 8550 - 500 - 300 - 370
    at_max = estimate_flip(listing(flip.max_buy_price), valuation(9000), settings, repair_costs=300, today=TODAY)
    assert at_max.profit == 500

    vat = DealSettings(fixed_costs={}, min_profit=500, vat_margin_scheme=True)
    flip = estimate_flip(listing(6000), valuation(9000), vat, today=TODAY)
    at_max = estimate_flip(listing(flip.max_buy_price), valuation(9000), vat, today=TODAY)
    assert 495 <= at_max.profit <= 505  # margin VAT included (rounding)
