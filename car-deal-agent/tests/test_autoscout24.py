from pathlib import Path

import pytest

from cardeal.sources.autoscout24 import (
    fuel_slug,
    gearbox_slug,
    is_autoscout24,
    parse_ad,
)

PAGE = (Path(__file__).parent / "fixtures" / "autoscout24_ad.html").read_text()
URL = ("https://www.autoscout24.de/angebote/opel-corsa-energy-benzin-schwarz-cat_ma54gr1918ge264va3184mt627tr480616"
       "-e5ce50e1-189a-4d47-9c20-c5642b55a5d7?source=list")


def test_reads_a_real_autoscout24_ad():
    car = parse_ad(PAGE, URL)
    assert car.id == "autoscout24:e5ce50e1-189a-4d47-9c20-c5642b55a5d7" and car.source == "autoscout24"
    assert car.url.endswith("-e5ce50e1-189a-4d47-9c20-c5642b55a5d7")  # tracking parameters dropped
    assert (car.make, car.model, car.title) == ("Opel", "Corsa", "Opel Corsa 1.4 Energy")
    assert (car.price, car.km, car.year, car.month, car.power_ps) == (2150, 216_000, 2014, 7, 87)
    assert (car.make_slug, car.model_slug, car.fuel_slug, car.gearbox_slug, car.body_slug) == (
        "opel", None, "benzin", "manuell", "kleinwagen")
    assert car.hu_until == "06/2027" and car.location == "88255 Baienfurt" and car.seller_type == "dealer"
    assert car.description.startswith("Gepflegt.\nKlima geht.") and len(car.images) == 3
    assert not car.damaged and car.details_loaded


def test_recognises_links_and_spellings():
    assert is_autoscout24(URL) and is_autoscout24("https://www.autoscout24.at/angebote/vw-golf-abc")
    assert not is_autoscout24("https://www.kleinanzeigen.de/s-anzeige/x/123") and not is_autoscout24("https://www.autoscout24.de/lst/opel")
    assert [fuel_slug(f) for f in ("Benzin", "Diesel", "Elektro/Benzin", "Autogas (LPG)", "Elektro")] == [
        "benzin", "diesel", "hybrid", "lpg", "elektro"]
    assert [gearbox_slug(g) for g in ("Schaltgetriebe", "Automatik", "Halbautomatik", None)] == [
        "manuell", "automatik", "automatik", None]


def test_a_page_without_an_ad_is_refused():
    with pytest.raises(ValueError):
        parse_ad("<html>Seite nicht gefunden</html>", URL)
