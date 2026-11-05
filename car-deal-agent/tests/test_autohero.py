from pathlib import Path

import pytest

from cardeal.sources.autohero import _number, _power_ps, is_autohero, parse_ad

PAGE = (Path(__file__).parent / "fixtures" / "autohero_ad.html").read_text(encoding="utf-8")
URL = "https://www.autohero.com/de/opel-corsa/id/6bfa0fd1-f9f3-4614-9978-ed104bc29700/?utm_source=x"


def test_reads_a_real_autohero_ad():
    car = parse_ad(PAGE, URL)
    assert car.id == "autohero:6bfa0fd1-f9f3-4614-9978-ed104bc29700" and car.source == "autohero"
    assert car.url == "https://www.autohero.com/de/opel-corsa/id/6bfa0fd1-f9f3-4614-9978-ed104bc29700/"
    assert (car.make, car.model, car.title) == ("Opel", "Corsa", "Opel Corsa 1.4 Turbo Active ecoFlex")
    assert (car.price, car.km, car.year, car.month, car.power_ps) == (8800, 67_142, 2018, 9, 100)
    assert (car.make_slug, car.fuel_slug, car.gearbox_slug, car.body_slug) == ("opel", "benzin", "manuell", "limousine")
    assert car.hu_until == "10/2028" and car.seller_type == "dealer" and not car.negotiable
    assert "Vorbesitzer: 2" in car.description and car.details_loaded
    # every photo once, in the large size
    assert car.images and all("/1116x744-" in image for image in car.images)
    assert len(car.images) == len(set(car.images))


def test_photos_of_other_cars_on_the_page_are_left_out():
    other = "https://img-eu-c1.autohero.com/img/ffff0000aaaa/exterior/1/373x249-0123456789abcdef.jpg"
    car = parse_ad(PAGE.replace("</body>", f'<img src="{other}"></body>', 1), URL)
    assert car.images == parse_ad(PAGE, URL).images and not any("ffff0000aaaa" in image for image in car.images)


def test_recognises_links_and_values():
    assert is_autohero(URL) and not is_autohero("https://www.autohero.com/de/search/?brand=opel")
    assert not is_autohero("https://www.kleinanzeigen.de/s-anzeige/x/123")
    assert [_number(v) for v in ("67.142 KMT", 67142, {"value": "120000", "unitCode": "KMT"}, None)] == [
        67142, 67142, 120000, None]
    assert _power_ps({"enginePower": "100 PS / 74 kW"}) == 100
    assert _power_ps({"enginePower": {"value": 74, "unitCode": "KWT"}}) == 101
    assert _power_ps({"enginePower": "110 kW"}) == 150


def test_a_page_without_a_car_is_refused():
    with pytest.raises(ValueError):
        parse_ad("<html><script type=\"application/ld+json\">{\"@type\":\"WebSite\"}</script></html>", URL)
