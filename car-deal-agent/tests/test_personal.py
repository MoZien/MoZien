import pytest
from helpers import make_analysis

from cardeal.config import DealSettings
from cardeal.models import Listing, Valuation
from cardeal.personal import (
    PersonalSettings,
    decide_personal,
    estimate_personal,
    estimated_consumption,
    offer_range,
    rating_for,
)


def car(price=8_000, negotiable=True, fuel="benzin", ps=100, title="VW Golf", **extra):
    return Listing(id="a", source="t", url="", title=title, price=price, negotiable=negotiable, year=2015,
                   km=100_000, fuel_slug=fuel, power_ps=ps, **extra)


MARKET = Valuation(10_000, 20, 0.2, "high", "regression")


@pytest.mark.parametrize("discount, rating", [
    (0.3, "steal"), (0.15, "steal"), (0.1, "good"), (0.0, "fair"), (-0.1, "high"), (-0.3, "overpriced"), (None, "unknown"),
])
def test_rating(discount, rating):
    assert rating_for(discount) == rating


def test_offers_never_go_above_the_asking_price_or_the_market():
    assert offer_range(7_000, 10_000, "steal", True) == (6_800, 7_000)  # pay a steal quickly
    assert offer_range(9_000, 10_000, "good", True) == (8_350, 9_000)
    assert offer_range(12_000, 10_000, "overpriced", True) == (9_000, 10_000)
    start, top = offer_range(10_000, 10_000, "fair", False)
    assert top == 10_000 and start == 9_500  # a fixed price leaves less room


def test_consumption_follows_fuel_power_and_use():
    assert estimated_consumption(car(ps=100)) == (7.0, "l")
    assert estimated_consumption(car(fuel="diesel", ps=100)) == (5.4, "l")
    assert estimated_consumption(car(fuel="elektro", ps=150)) == (16.0, "kWh")
    assert estimated_consumption(car(ps=100), "city")[0] > estimated_consumption(car(ps=100), "highway")[0]


def test_first_year_costs_add_up():
    settings = PersonalSettings(annual_km=10_000)
    estimate = estimate_personal(car(hu_until="01/2020"), MARKET, settings, DealSettings(), repair_costs=300)
    assert estimate.fuel_per_year == round(10_000 / 100 * 7.0 * 2.10)
    assert estimate.hu_cost == 150  # TÜV expired
    assert estimate.first_year_cost == 300 + 150 + 120 + estimate.fuel_per_year
    assert estimate.rating == "steal"


def test_verdicts_for_buying_to_keep():
    settings, deal = PersonalSettings(max_budget=7_000), DealSettings()

    def verdict(listing, analysis=None, valuation=MARKET):
        estimate = estimate_personal(listing, valuation, settings, deal)
        return decide_personal(listing, valuation, estimate, settings, deal, analysis, "de")

    assert verdict(car(price=9_000))[0] == "negotiate"  # good price, but above the 7,000 budget
    assert verdict(car(price=6_500))[0] == "buy"
    assert verdict(car(price=11_000))[0] == "negotiate"
    assert verdict(car(price=13_000))[0] == "avoid"
    assert verdict(car(price=6_500, title="Golf für Bastler"))[0] == "check"
    assert verdict(car(price=6_500), make_analysis(scam_risk="high"))[0] == "avoid"
    low = Valuation(10_000, 5, 0.6, "low", "regression")
    assert verdict(car(price=6_500), valuation=low)[0] == "check"
    _, reasons, score = verdict(car(price=13_000))
    assert score <= 30 and "über dem Marktpreis" in reasons[0]
