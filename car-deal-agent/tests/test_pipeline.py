import random
import statistics
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

    assert comps == 15
    assert report.valuation.market_price == 3_500
    assert source.model_searches()[0].seller == "privat"  # you resell privately


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
    h, source, _ = broad_hunter([ad(f"x{i}", 3_000, year=2008, km=150_000) for i in range(5)],  # ~325 € profit
                                {f"kleinanzeigen:x{i}": OPEL_CORSA for i in range(5)})
    found, evaluated = h.find_deals(3, max_ads=2)
    assert found == [] and evaluated == 2 and len(source.detail_calls) == 2


class TieredMarketplace(FakeSource):
    """Comparables depend on how exact the search is: the exact one finds only 2 cars."""

    def __init__(self, ad_details):
        super().__init__([])
        self.ad_details = ad_details

    def search(self, criteria, price_ceiling=None):
        self.searches.append(criteria)
        n = 2 if criteria.body_type else 15
        return [ad(f"golf-{criteria.body_type}-{i}", 9_000 + (i % 3) * 100, year=2014, km=100_000) for i in range(n)]

    def fetch_details(self, listing):
        self.detail_calls.append(listing.id)
        for key, value in self.ad_details.items():
            setattr(listing, key, value)
        listing.details_loaded = True
        return listing


GOLF_DETAILS = dict(
    make="Volkswagen", model="Weitere Golf", year=2014, km=100_000, price=6_000, fuel="Benzin", gearbox="Manuell",
    body_type="Limousine", power_ps=122, make_slug="volkswagen", model_slug="golf", fuel_slug="benzin",
    gearbox_slug="manuell", body_slug="limousine",
)


def test_exact_comparables_widen_step_by_step():
    source = TieredMarketplace(GOLF_DETAILS)
    h = DealHunter(AppConfig(searches=[BROAD]), source, Store(":memory:"), None, None, clock=lambda: NOW)

    report, comparables = h.analyze_url("https://www.kleinanzeigen.de/s-anzeige/vw-golf/3202186316-216-143")

    exact, same_fuel = source.searches
    assert (exact.model, exact.fuel, exact.gearbox, exact.body_type) == ("golf", "benzin", "manuell", "limousine")
    assert (same_fuel.fuel, same_fuel.gearbox, same_fuel.body_type) == ("benzin", "manuell", None)
    # never loosened: same model, same engine (122 PS ±5 %), ±2 years, private, undamaged
    assert all((s.model, s.min_power, s.max_power, s.min_year, s.max_year, s.seller, s.damaged)
               == ("golf", 116, 128, 2012, 2016, "privat", False) for s in source.searches)
    assert comparables == 15
    assert report.valuation.market_price == 9_100
    assert report.valuation.basis == "Golf · Benzin · Manuell · 116–128 PS · 2012–2016"
    assert "power_i:116%2C128" in report.valuation.comparables_url

    h.analyze_url("https://www.kleinanzeigen.de/s-anzeige/vw-golf/3202186399-216-143")
    assert len(source.searches) == 2  # both searches cached for the next ad


def test_damaged_car_is_never_a_deal():
    source = TieredMarketplace({**GOLF_DETAILS, "condition": "Beschädigtes Fahrzeug"})
    h = DealHunter(AppConfig(searches=[BROAD]), source, Store(":memory:"), None, None, clock=lambda: NOW)
    report, _ = h.analyze_url("https://www.kleinanzeigen.de/s-anzeige/vw-golf/3202186316-216-143")
    assert report.verdict == "check"
    assert any("beschädigt" in r or "متضررة" in r for r in report.reasons)


def test_model_name_for_models_filed_under_andere():
    from cardeal.pipeline import model_name

    def car(**kw):
        return Listing(**{"id": "a", "source": "k", "url": "u", "title": "", "price": 1, **kw})

    assert model_name(car(make="Volkswagen", model="Weitere Golf")) == "Golf"
    assert model_name(car(make="Volkswagen", model="Weitere Volkswagen", title="VW Scirocco 1.4 TSI")) == "Scirocco"
    assert model_name(car(make="Mercedes-Benz", model="Andere", title="Mercedes Benz SLK 200")) == "SLK"
    assert model_name(car(make="Opel", model="", title="")) == ""


def test_andere_models_are_compared_by_name_within_andere():
    source = TieredMarketplace({**GOLF_DETAILS, "model": "Weitere Volkswagen", "model_slug": "andere",
                                "title": "VW Scirocco 1.4 TSI", "body_slug": "coupe", "body_type": "Coupé"})
    h = DealHunter(AppConfig(searches=[BROAD]), source, Store(":memory:"), None, None, clock=lambda: NOW)
    report, _ = h.analyze_url("https://www.kleinanzeigen.de/s-anzeige/vw-scirocco/3540190341-216-4225")
    assert all((s.model, s.query) == ("andere", "scirocco") for s in source.searches)
    assert report.valuation.basis.startswith("Scirocco · Benzin")


def test_unknown_brand_has_no_model():
    from cardeal.pipeline import model_name
    assert model_name(Listing(id="a", source="k", url="u", title="Auto zu verkaufen", price=1,
                              make="Andere", model="Andere")) == ""


def test_areas_can_be_left_out():
    config = AppConfig(searches=[BROAD])
    config.filters.exclude_zip_ranges = ["10115-14199"]
    config.filters.exclude_places = ["Berlin"]
    h = DealHunter(config, FakeSource([]), Store(":memory:"), clock=lambda: NOW)

    def at(location):
        return h._is_candidate(replace(ad("x", 2_000, year=2008, km=150_000), location=location), BROAD)

    assert not at("10115 Mitte")  # search results show only the district
    assert not at("13409 Reinickendorf")
    assert not at("14199 Berlin - Schmargendorf")
    assert not at("Berlin - Spandau")
    assert at("14467 Potsdam")  # just outside the Berlin range
    assert at("06108 Halle")


def test_bad_zip_range_is_reported():
    import pytest

    from cardeal.config import FilterSettings
    with pytest.raises(ValueError, match="10115-14199"):
        FilterSettings(exclude_zip_ranges=["Berlin"]).zip_ranges()


def test_no_price_rather_than_other_engines():
    class FewMatches(TieredMarketplace):
        def search(self, criteria, price_ceiling=None):
            self.searches.append(criteria)
            return [ad(f"g{i}", 9_000, year=2014, km=100_000) for i in range(3)]  # too few in every step

    source = FewMatches(GOLF_DETAILS)
    h = DealHunter(AppConfig(searches=[BROAD]), source, Store(":memory:"), None, None, clock=lambda: NOW)
    report, comparables = h.analyze_url("https://www.kleinanzeigen.de/s-anzeige/vw-golf/3202186316-216-143")
    assert report is None and comparables == 3
    # the same engine in every step; then the PS field read as kW (122 kW = 166 PS), which finds
    # just as few, so no price either
    powers = [(s.min_power, s.max_power) for s in source.searches]
    assert powers == [(116, 128)] * 3 + [(158, 174)] * 3
    assert all(s.fuel == "benzin" for s in source.searches)  # never petrol against diesel


def test_hunt_never_brings_cars_for_tinkerers_or_leasing_offers():
    h, source, _ = broad_hunter([ad("seed", 2_000)], {})
    h.run_once()
    source.listings += [
        ad("bastler", 900, year=2008, km=150_000, title="Opel Corsa für Bastler"),
        ad("leasing", 1_500, year=2008, km=150_000, title="Leasingübernahme Opel Corsa"),
        ad("engine", 1_200, year=2008, km=150_000, title="Opel Corsa D"),  # the ad text tells
    ]
    source.details["kleinanzeigen:engine"] = {**OPEL_CORSA, "description": "Motorschaden, springt nicht an."}

    assert h.run_once() == []
    assert source.detail_calls == ["kleinanzeigen:engine"]  # the others were skipped by their title
    assert source.model_searches() == [] and h.analyzer.calls == 0  # no comparables, no AI credit


def test_comparables_without_a_fair_price_are_not_counted():
    junk = [ad("corsa-bastler", 900, year=2008, km=150_000, title="Opel Corsa Bastlerfahrzeug"),
            replace(ad("corsa-no-tuv", 1_000, year=2008, km=150_000, title="Opel Corsa"),
                    description="Fährt, aber leider kein TÜV mehr")]
    url = "https://www.kleinanzeigen.de/s-anzeige/opel-corsa-2008/3545110385-216-1"
    details = {"kleinanzeigen:3545110385": {**OPEL_CORSA, "price": 2_200, "year": 2008, "km": 150_000}}
    h, source, _ = broad_hunter([], details)
    source.comps[("opel", "corsa")] += junk

    report, comps = h.analyze_url(url)
    assert comps == 15 and report.valuation.market_price == 3_500
    assert not {c.url for c in report.valuation.used} & {"https://k/corsa-bastler", "https://k/corsa-no-tuv"}


class PowerMarketplace(TieredMarketplace):
    """Hardly any car with the ad's PS value, plenty with the same value read as kW."""

    def search(self, criteria, price_ceiling=None):
        self.searches.append(criteria)
        n = 20 if criteria.min_power and criteria.min_power > 120 else 2
        return [ad(f"p{criteria.min_power}-{criteria.gearbox}-{i}", 4_000 + (i % 3) * 100, year=2010, km=180_000 + i)
                for i in range(n)]


INSIGNIA = {"make": "Opel", "model": "Insignia", "year": 2010, "km": 188_000, "price": 1_999, "power_ps": 103,
            "make_slug": "opel", "model_slug": "insignia", "fuel_slug": "benzin", "gearbox_slug": "manuell",
            "fuel": "Benzin", "gearbox": "Manuell"}


def test_ps_field_holding_kw_is_tried_and_flagged():
    source = PowerMarketplace(INSIGNIA)
    h = DealHunter(AppConfig(searches=[BROAD]), source, Store(":memory:"), None, None, clock=lambda: NOW)
    report, comparables = h.analyze_url("https://www.kleinanzeigen.de/s-anzeige/opel-insignia/3546111111-216-1")

    assert [(s.min_power, s.max_power) for s in source.searches][-1] == (133, 147)  # 103 kW = 140 PS
    assert comparables == 20 and report.valuation.power_as_kw
    assert report.valuation.confidence == "low" and report.verdict == "check"
    assert "133–147 PS (103 = kW?)" in report.valuation.basis
    assert any("103 PS gibt es bei dem Modell kaum" in r or "103 PS" in r for r in report.reasons)


def test_ps_field_holding_kw_said_in_the_ad_text():
    from cardeal.pipeline import engine_power
    car = Listing(id="x", source="t", url="", title="Opel Insignia 1.8", price=1_999, power_ps=103,
                  description="Motor 1.8 mit 103 kW, Klima")
    assert engine_power(car) == (140, True)
    car.description = "Motor 1.8 mit 140 PS"
    assert engine_power(car) == (140, True)
    car.description = "103 PS laut Schein"
    assert engine_power(car) == (103, False)


def test_a_narrow_search_only_counts_with_enough_cars():
    class FewExact(TieredMarketplace):
        def search(self, criteria, price_ceiling=None):
            self.searches.append(criteria)
            if criteria.body_type:  # same body: 6 cars, too few to trust their median
                return [ad(f"body-{i}", 7_000, year=2014, km=100_000 + i) for i in range(6)]
            return [ad(f"gear-{i}", 9_000 + (i % 3) * 100, year=2014, km=100_000 + i) for i in range(20)]

    source = FewExact(GOLF_DETAILS)
    h = DealHunter(AppConfig(searches=[BROAD]), source, Store(":memory:"), None, None, clock=lambda: NOW)
    report, comparables = h.analyze_url("https://www.kleinanzeigen.de/s-anzeige/vw-golf/3202186316-216-143")
    assert comparables == 20 and report.valuation.market_price == 9_100
    assert report.valuation.basis == "Golf · Benzin · Manuell · 116–128 PS · 2012–2016"


def test_ad_with_a_mileage_that_cannot_be_right_is_not_valued():
    from cardeal.pipeline import ImplausibleMileage
    source = TieredMarketplace({**GOLF_DETAILS, "km": 114, "year": 2007})  # "114 TKM" typed as 114
    h = DealHunter(AppConfig(searches=[BROAD]), source, Store(":memory:"), None, None, clock=lambda: NOW)
    try:
        h.analyze_url("https://www.kleinanzeigen.de/s-anzeige/vw-golf/3202186316-216-143")
    except ImplausibleMileage as exc:
        assert exc.km == 114
    else:
        raise AssertionError("expected ImplausibleMileage")
    assert source.searches == []  # no comparables fetched for nothing


def test_market_price_follows_the_price_level_around_home():
    local_zips = ["04103 Leipzig", "04105 Leipzig", "04107 Leipzig", "04109 Leipzig", "04129 Leipzig"]
    far_zips = ["80331 München", "80333 München", "80335 München", "80336 München", "80337 München"]

    class TwoRegions(TieredMarketplace):
        def search(self, criteria, price_ceiling=None):
            self.searches.append(criteria)
            cars = []
            for i in range(60):  # every third car around Leipzig, 10 % cheaper; all different cars
                local, k = i % 3 == 0, i // 3 if i % 3 == 0 else i - i // 3 - 1
                cars.append(replace(ad(f"r{i}", 4_500 if local else 5_000, year=2014, km=100_000 + 7 * i),
                                    month=k // 5 + 1, location=(local_zips if local else far_zips)[k % 5]))
            return cars

    config = AppConfig(searches=[BROAD])
    config.trip.home_zip = "06108"
    h = DealHunter(config, TwoRegions(GOLF_DETAILS), Store(":memory:"), None, None, clock=lambda: NOW)
    valuation = h.analyze_url("https://www.kleinanzeigen.de/s-anzeige/vw-golf/3202186316-216-143")[0].valuation
    assert valuation.comparables == 60
    assert valuation.local_ads == 20 and 0.9 < valuation.local_factor < 0.94  # 10 % cheaper, pulled towards 1
    median = statistics.median(c.adjusted for c in valuation.used)
    assert valuation.market_price == round(median * valuation.local_factor, -1)

    config.trip.home_zip = None  # no home: prices of all of Germany as they are
    h = DealHunter(config, TwoRegions(GOLF_DETAILS), Store(":memory:"), None, None, clock=lambda: NOW)
    valuation = h.analyze_url("https://www.kleinanzeigen.de/s-anzeige/vw-golf/3202186316-216-143")[0].valuation
    assert valuation.local_factor is None and valuation.market_price == round(median, -1)
