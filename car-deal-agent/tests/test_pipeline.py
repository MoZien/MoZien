import random
from dataclasses import replace
from datetime import datetime

from helpers import make_analysis

from cardeal.analyzer import AnalysisError
from cardeal.config import AppConfig
from cardeal.models import Listing, SearchCriteria
from cardeal.pipeline import DealHunter
from cardeal.storage import Store

NOW = datetime(2026, 10, 18, 12, 0)
SEARCH = SearchCriteria(name="Golf", make="volkswagen", model="golf", max_price=9000, min_price=2000,
                        min_year=2013, max_km=160_000)


def ad(ad_id, price, year=2015, km=100_000, title="VW Golf"):
    return Listing(id=f"kleinanzeigen:{ad_id}", source="kleinanzeigen", url=f"https://k/{ad_id}",
                   title=title, price=price, year=year, km=km)


def market_listings():
    rng = random.Random(3)
    return [ad(f"m{i}", round(9_500 * rng.uniform(0.92, 1.08)), 2015, rng.randint(90_000, 110_000))
            for i in range(20)]


class FakeSource:
    name = "fake"

    def __init__(self, listings):
        self.listings = listings
        self.searches = []
        self.ceilings = []
        self.detail_calls = []

    def search(self, criteria, price_ceiling=None):
        self.searches.append(criteria)
        self.ceilings.append(price_ceiling)
        return [replace(listing) for listing in self.listings]

    def fetch_details(self, listing):
        self.detail_calls.append(listing.id)
        listing.description = "Scheckheft, 1. Hand"
        listing.details_loaded = True
        return listing


class FakeAnalyzer:
    def __init__(self, result=None, error=None):
        self.result = result or make_analysis(estimated_repair_cost_eur=300)
        self.error = error
        self.calls = 0

    def analyze(self, listing, valuation, flip):
        self.calls += 1
        if self.error:
            raise self.error
        return self.result


class FakeNotifier:
    def __init__(self):
        self.sent = []

    def send(self, report):
        self.sent.append(report)


def hunter(listings, analyzer=None, alert_existing=True):
    config = AppConfig(searches=[SEARCH])
    config.deal.alert_existing = alert_existing
    notifier = FakeNotifier()
    source = FakeSource(listings)
    return DealHunter(config, source, Store(":memory:"), analyzer, notifier, clock=lambda: NOW), source, notifier


def test_finds_the_cheap_car_and_ignores_the_rest():
    bargain = ad("cheap", 6_500)
    over_budget = ad("pricey", 9_400)
    fair = ad("fair", 9_000)
    spam = ad("spam", 3_000, title="Auto Ankauf – wir kaufen jedes Auto")
    analyzer = FakeAnalyzer()
    h, source, notifier = hunter(market_listings() + [bargain, over_budget, fair, spam], analyzer)

    reports = h.run_once()

    assert [r.listing.id for r in reports] == ["kleinanzeigen:cheap"]
    report = reports[0]
    assert report.verdict == "deal"
    assert report.flip.repair_costs == 300
    assert report.valuation.market_price > 9_000
    assert source.ceilings == [14_400]  # market data up to 1.6x budget
    assert source.detail_calls == ["kleinanzeigen:cheap"]  # details/AI only for the candidate
    assert analyzer.calls == 1
    assert notifier.sent == reports


def test_market_data_search_is_wider_than_the_users_limits():
    too_many_km = ad("km", 6_000, km=170_000)
    too_old = ad("old", 6_000, year=2012)
    h, source, _ = hunter(market_listings() + [too_many_km, too_old], FakeAnalyzer())

    assert h.run_once() == []
    searched = source.searches[0]
    assert (searched.min_year, searched.max_km) == (2011, 224_000)
    assert len(h.store.comparables(SEARCH.segment, NOW)) == 22  # both still count as market data


def test_first_run_only_collects_market_data_then_alerts_on_new_ads():
    analyzer = FakeAnalyzer()
    h, source, notifier = hunter(market_listings() + [ad("old-bargain", 6_500)], analyzer, alert_existing=False)

    assert h.run_once() == []
    assert source.detail_calls == [] and analyzer.calls == 0
    assert len(h.store.comparables(SEARCH.segment, NOW)) == 21

    source.listings.append(ad("new-bargain", 6_400))
    reports = h.run_once()
    assert [r.listing.id for r in reports] == ["kleinanzeigen:new-bargain"]
    assert [r.listing.id for r in notifier.sent] == ["kleinanzeigen:new-bargain"]


def test_second_run_does_not_repeat_but_price_drop_does():
    listings = market_listings() + [ad("cheap", 6_500), ad("almost", 8_200)]
    h, source, notifier = hunter(listings, FakeAnalyzer())
    h.run_once()
    assert len(notifier.sent) == 1

    h.run_once()
    assert len(notifier.sent) == 1

    source.listings[-1] = ad("almost", 6_900)  # seller drops the price
    h.run_once()
    assert [r.listing.id for r in notifier.sent] == ["kleinanzeigen:cheap", "kleinanzeigen:almost"]


def test_failed_ai_review_downgrades_to_check():
    h, _, notifier = hunter(market_listings() + [ad("cheap", 6_500)], FakeAnalyzer(error=AnalysisError("x")))
    reports = h.run_once()
    assert reports[0].verdict == "check"
    assert reports[0].analysis is None
    assert len(notifier.sent) == 1


def test_ai_skip_is_saved_but_not_sent():
    analyzer = FakeAnalyzer(make_analysis(verdict="skip", verdict_reason="Motorschaden"))
    h, _, notifier = hunter(market_listings() + [ad("cheap", 6_500)], analyzer)
    reports = h.run_once()
    assert reports[0].verdict == "skip"
    assert notifier.sent == []
    assert h.store.recent_reports(verdicts=("skip",))[0]["analysis"]["verdict_reason"] == "Motorschaden"


def test_without_market_data_nothing_is_reported():
    h, source, notifier = hunter([ad("cheap", 6_500), ad("other", 8_000)])
    assert h.run_once() == []
    assert source.detail_calls == []
