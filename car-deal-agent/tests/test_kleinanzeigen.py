from pathlib import Path

import pytest

from cardeal.models import Listing, SearchCriteria
from cardeal.sources.base import SourceBlockedError
from cardeal.sources.kleinanzeigen import (
    KleinanzeigenSource,
    build_search_url,
    listing_from_url,
    make_slug,
    parse_detail_page,
    parse_month_year,
    parse_price,
    parse_search_results,
)

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.mark.parametrize(
    "text, expected",
    [
        ("6.390 € VB", (6390, True)),
        ("  12.500 €  ", (12500, False)),
        ("950 €", (950, False)),
        ("VB", (None, True)),
        ("Zu verschenken", (0, False)),
        ("9.990 € 10.990 €", (9990, False)),
        ("72.500 km", None),
        ("Scheckheft gepflegt, 2 €", None),
    ],
)
def test_parse_price(text, expected):
    assert parse_price(text) == expected


@pytest.mark.parametrize(
    "text, expected",
    [("Dezember 2014", (12, 2014)), ("März 2026", (3, 2026)), ("03/2027", (3, 2027)), ("2015", (None, 2015)),
     ("unbekannt", (None, None))],
)
def test_parse_month_year(text, expected):
    assert parse_month_year(text) == expected


def test_build_search_url_with_all_filters():
    criteria = SearchCriteria(
        name="golf", make="volkswagen", model="golf", min_price=2000, max_price=9000,
        min_year=2013, max_km=160000, fuel="benzin", gearbox="manuell", radius_km=100,
    )
    url = build_search_url(criteria, page=2, location_id="3331", price_ceiling=14400)
    assert url == (
        "https://www.kleinanzeigen.de/s-autos/volkswagen/preis:2000:14400/seite:2/"
        "c216l3331r100+autos.ez_i:2013%2C+autos.km_i:%2C160000+autos.marke_s:volkswagen"
        "+autos.model_s:golf+autos.fuel_s:benzin+autos.shift_s:manuell"
    )


def test_build_search_url_free_text():
    url = build_search_url(SearchCriteria(name="x", query="Golf GTI", max_price=8000))
    assert url == "https://www.kleinanzeigen.de/s-autos/preis::8000/golf-gti/k0c216"


def test_parse_search_results():
    listings = parse_search_results((FIXTURES / "search_page.html").read_text(encoding="utf-8"))
    assert [listing.id for listing in listings] == [
        "kleinanzeigen:1000000001", "kleinanzeigen:1000000002", "kleinanzeigen:1000000003",
    ]
    first, second, third = listings
    assert first.url == "https://www.kleinanzeigen.de/s-anzeige/vw-golf-vii-1-2-tsi/1000000001-216-1234"
    assert (first.title, first.price, first.negotiable) == ("VW Golf VII 1.2 TSI", 6390, True)
    assert (first.km, first.month, first.year, first.location) == (72500, 8, 2014, "10115 Mitte")
    assert first.description == "Scheckheft gepflegt – Nichtraucher"
    assert (second.price, second.negotiable, second.km, second.year) == (9500, False, 145000, 2013)
    assert (third.title, third.price, third.negotiable) == ("Golf 6 Tausch möglich", None, True)


def test_parse_detail_page():
    listing = Listing(id="kleinanzeigen:1", source="kleinanzeigen", url="u", title="", price=6390)
    parse_detail_page((FIXTURES / "detail_page.html").read_text(encoding="utf-8"), listing)
    assert listing.title == "VW Golf VII 1.2 TSI"
    assert (listing.price, listing.negotiable) == (6200, True)
    assert (listing.make, listing.model, listing.km) == ("Volkswagen", "Weitere Golf", 72500)
    assert (listing.month, listing.year, listing.power_ps) == (8, 2014, 105)
    assert (listing.fuel, listing.gearbox, listing.hu_until) == ("Benzin", "Manuell", "03/2026")
    assert listing.condition == "Unbeschädigtes Fahrzeug"
    assert listing.seller_type == "private"
    assert listing.location == "10115 Berlin - Mitte"
    assert listing.features == ["Klimaanlage", "Scheckheftgepflegt"]
    assert listing.description.splitlines() == [
        "Verkaufe meinen Golf.", "Steuerkette wurde 2023 gewechselt.", "Klima muss befüllt werden.",
    ]
    assert listing.details_loaded


def test_make_slug_and_listing_from_url():
    assert make_slug("Mercedes-Benz") == "mercedes_benz"
    assert make_slug("Citroën") == "citroen"
    listing = listing_from_url("https://www.kleinanzeigen.de/s-anzeige/vw-golf/3202186316-216-143")
    assert listing.id == "kleinanzeigen:3202186316"
    with pytest.raises(ValueError):
        listing_from_url("https://example.com/car/1")


class FakeResponse:
    def __init__(self, text="", status_code=200):
        self.text = text
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.urls = []
        self.headers = {}

    def get(self, url, timeout):
        self.urls.append(url)
        return self.responses.pop(0)


def test_source_search_resolves_location_paginates_and_throttles():
    page = (FIXTURES / "search_page.html").read_text(encoding="utf-8")
    last_page = page.replace("seite:2", "")
    session = FakeSession([
        FakeResponse('{"_0":"Deutschland","_9668":"10115 Mitte"}'),
        FakeResponse(page),
        FakeResponse(last_page),
    ])
    pauses = []
    source = KleinanzeigenSource(session=session, sleep=pauses.append)
    criteria = SearchCriteria(name="golf", make="volkswagen", zip_code="10115", radius_km=50, pages=5)

    listings = source.search(criteria)

    assert len(listings) == 3  # same ads on both pages are deduplicated
    assert "query=10115" in session.urls[0]
    assert "c216l9668r50" in session.urls[1]
    assert "seite:2" in session.urls[2]
    assert len(session.urls) == 3  # stops when there is no next page
    assert len(pauses) == 2 and all(4 <= p <= 9 for p in pauses)


def test_source_raises_when_blocked():
    source = KleinanzeigenSource(session=FakeSession([FakeResponse(status_code=403)]), sleep=lambda s: None)
    with pytest.raises(SourceBlockedError):
        source.search(SearchCriteria(name="x", make="bmw"))
