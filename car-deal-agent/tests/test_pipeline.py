import random
from dataclasses import replace
from datetime import datetime

from helpers import issue, make_analysis

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
        listing.description = "Scheckheft, 1. Hand. Klima muss befüllt werden."
        listing.details_loaded = True
        return listing


class FakeAnalyzer:
    def __init__(self, result=None, error=None):
        self.result = result or make_analysis(issues=[issue()])  # 300 €, quote is in the ad
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


BROAD = SearchCriteria(name="Alle Autos", max_price=3000, min_price=500, min_year=2002, max_km=200_000,
                       seller="privat")


class FakeMarketplace(FakeSource):
    """Broad searches return `listings`, model searches return `comps[(make, query)]`."""

    def __init__(self, listings, comps, details):
        super().__init__(listings)
        self.comps = comps
        self.details = details

    def search(self, criteria, price_ceiling=None):
        self.searches.append(criteria)
        if criteria.is_broad:
            return [replace(listing) for listing in self.listings]
        return [replace(listing) for listing in self.comps.get((criteria.make, criteria.query), [])]

    def fetch_details(self, listing):
        self.detail_calls.append(listing.id)
        for key, value in self.details[listing.id].items():
            setattr(listing, key, value)
        listing.details_loaded = True
        return listing

    def model_searches(self):
        return [s for s in self.searches if not s.is_broad]


def corsa_market():
    prices = [3_300, 3_400, 3_500, 3_600, 3_700] * 3
    return [ad(f"corsa-m{i}", price, year=2008, km=150_000) for i, price in enumerate(prices)]


def broad_hunter(listings, details, max_details=30):
    config = AppConfig(searches=[BROAD])
    config.deal.min_profit = 400
    config.scraper.max_details_per_run = max_details
    source = FakeMarketplace(listings, {("opel", "corsa"): corsa_market()}, details)
    notifier = FakeNotifier()
    h = DealHunter(config, source, Store(":memory:"), FakeAnalyzer(), notifier, clock=lambda: NOW)
    return h, source, notifier


OPEL_CORSA = {"make": "Opel", "model": "Corsa"}


def test_broad_search_values_each_ad_by_its_own_model():
    h, source, notifier = broad_hunter([ad("old", 2_000, year=2008, km=150_000)], {})
    assert h.run_once() == []  # first run: warm-up, no ad opened
    assert source.detail_calls == [] and source.model_searches() == []

    source.listings += [
        ad("corsa", 2_200, year=2008, km=150_000, title="Opel Corsa D"),
        ad("mystery", 1_500, year=2008, km=150_000, title="Auto"),
        ad("over-budget", 3_500, year=2008, km=150_000),
    ]
    source.details.update({"kleinanzeigen:corsa": OPEL_CORSA,
                           "kleinanzeigen:mystery": {"make": "Andere", "model": "Andere"}})
    reports = h.run_once()

    assert source.detail_calls == ["kleinanzeigen:corsa", "kleinanzeigen:mystery"]
    [model_search] = source.model_searches()
    assert (model_search.make, model_search.query, model_search.min_year, model_search.max_year,
            model_search.seller) == ("opel", "corsa", 2006, 2010, "privat")
    assert [r.listing.id for r in reports] == ["kleinanzeigen:corsa"]
    assert reports[0].valuation.market_price == 3_500
    assert reports[0].verdict == "deal"
    assert notifier.sent == reports

    source.listings.append(ad("corsa-2", 2_400, year=2008, km=150_000))
    source.details["kleinanzeigen:corsa-2"] = OPEL_CORSA
    h.run_once()
    assert len(source.model_searches()) == 1  # comparables for this model and year are cached


def test_broad_search_caps_detail_pages_per_run():
    h, source, _ = broad_hunter([ad("seed", 2_000)], {}, max_details=1)
    h.run_once()
    source.listings += [ad("a", 2_200, year=2008, km=150_000), ad("b", 2_250, year=2008, km=150_000)]
    source.details.update({"kleinanzeigen:a": OPEL_CORSA, "kleinanzeigen:b": OPEL_CORSA})

    h.run_once()
    assert source.detail_calls == ["kleinanzeigen:a"]
    h.run_once()
    assert source.detail_calls == ["kleinanzeigen:a", "kleinanzeigen:b"]


def test_analyze_url_uses_model_comparables():
    url = "https://www.kleinanzeigen.de/s-anzeige/opel-corsa-2008/3545110385-216-1"
    details = {"kleinanzeigen:3545110385": {**OPEL_CORSA, "price": 2_200, "year": 2008, "km": 150_000}}
    h, source, _ = broad_hunter([], details)

    report, comps = h.analyze_url(url)

    assert comps == 16  # 15 comparables + the ad itself
    assert report.valuation.market_price == 3_500
    assert source.model_searches()[0].seller is None


def test_between_ads_hook_runs_before_each_evaluated_ad():
    h, source, _ = broad_hunter([ad("seed", 2_000)], {})
    h.run_once()
    source.listings += [ad("a", 2_200, year=2008, km=150_000), ad("b", 2_250, year=2008, km=150_000)]
    source.details.update({"kleinanzeigen:a": OPEL_CORSA, "kleinanzeigen:b": OPEL_CORSA})
    calls = []
    h.between_ads = lambda: calls.append(len(source.detail_calls))
    h.run_once()
    assert calls == [0, 1]  # before the first and before the second ad


def test_find_deals_stops_at_the_requested_number():
    h, source, notifier = broad_hunter([
        ad("pricey", 3_000, year=2008, km=150_000),  # fair price: evaluated, no deal
        ad("deal-1", 2_200, year=2008, km=150_000),
        ad("deal-2", 2_250, year=2008, km=150_000),
        ad("deal-3", 2_150, year=2008, km=150_000),
    ], {f"kleinanzeigen:{k}": OPEL_CORSA for k in ("pricey", "deal-1", "deal-2", "deal-3")})
    found_live = []

    found, evaluated = h.find_deals(2, max_ads=10, on_found=found_live.append)

    assert [r.listing.id for r in found] == ["kleinanzeigen:deal-1", "kleinanzeigen:deal-2"]
    assert found_live == found and evaluated == 3
    assert "kleinanzeigen:deal-3" not in source.detail_calls  # stopped searching
    assert notifier.sent == []  # finds go to whoever asked, not to the alert channel
    found, _ = h.find_deals(2, max_ads=10)
    assert [r.listing.id for r in found] == ["kleinanzeigen:deal-3"]  # no repeats


def test_find_deals_respects_the_ad_limit():
    h, source, _ = broad_hunter([ad(f"x{i}", 2_900, year=2008, km=150_000) for i in range(5)],
                                {f"kleinanzeigen:x{i}": OPEL_CORSA for i in range(5)})
    found, evaluated = h.find_deals(3, max_ads=2)
    assert found == [] and evaluated == 2 and len(source.detail_calls) == 2
