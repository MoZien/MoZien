"""Kleinanzeigen.de adapter: builds search URLs and parses result and detail pages.

Kleinanzeigen has no public API, so this reads the HTML pages. Parsing keys on
text patterns ("12.500 € VB", "EZ 03/2015", "120.000 km") instead of CSS class
names, because the class names change with every redesign.
"""

from __future__ import annotations

import html as html_lib
import json
import logging
import random
import re
import time
import unicodedata
from collections.abc import Callable
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup, Tag

from cardeal.config import ScraperSettings
from cardeal.models import Listing, SearchCriteria
from cardeal.sources.base import SourceBlockedError

log = logging.getLogger(__name__)

BASE_URL = "https://www.kleinanzeigen.de"
CARS_CATEGORY = 216
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)

GERMAN_MONTHS = {
    "januar": 1, "februar": 2, "märz": 3, "maerz": 3, "april": 4, "mai": 5, "juni": 6,
    "juli": 7, "august": 8, "september": 9, "oktober": 10, "november": 11, "dezember": 12,
}

_AMOUNT_RE = re.compile(r"(\d{1,3}(?:\.\d{3})+|\d+)\s*€")
_KM_RE = re.compile(r"^([\d.]+)\s*km$", re.IGNORECASE)
_EZ_RE = re.compile(r"^EZ\s*(\d{1,2})/(\d{4})$")
_ZIP_CITY_RE = re.compile(r"^\d{5}\s+\S")


def _clean(text: str | None) -> str:
    return " ".join((text or "").split())


def _to_int(digits: str) -> int:
    return int(re.sub(r"\D", "", digits))


def parse_price(text: str) -> tuple[int | None, bool] | None:
    """'12.500 € VB' -> (12500, True); 'VB' -> (None, True); other text -> None."""
    text = _clean(text)
    if text == "VB":
        return None, True
    if text.lower() == "zu verschenken":
        return 0, False
    # Price drops render as "9.990 € 10.990 €": the first amount is the current one.
    if "€" not in text or not re.fullmatch(r"[\d.\s€]+(VB)?", text):
        return None
    amounts = _AMOUNT_RE.findall(text)
    if not amounts:
        return None
    return _to_int(amounts[0]), text.endswith("VB")


def parse_month_year(text: str) -> tuple[int | None, int | None]:
    """'Dezember 2014', '12/2014' or '2014' -> (month, year)."""
    text = _clean(text).lower()
    if m := re.fullmatch(r"(\d{1,2})/(\d{4})", text):
        return int(m.group(1)), int(m.group(2))
    if m := re.fullmatch(r"([a-zäöü]+)\s+(\d{4})", text):
        return GERMAN_MONTHS.get(m.group(1)), int(m.group(2))
    if m := re.fullmatch(r"\d{4}", text):
        return None, int(m.group(0))
    return None, None


def make_slug(name: str) -> str:
    """'Mercedes-Benz' -> 'mercedes_benz', 'Citroën' -> 'citroen' (Kleinanzeigen brand filter)."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_")


def listing_from_url(url: str) -> Listing:
    """Bare listing for an ad URL like .../s-anzeige/vw-golf/3202186316-216-143."""
    match = re.search(r"/(\d+)-\d+-\d+/?(?:\?.*)?$", url)
    if not match or "kleinanzeigen.de" not in url:
        raise ValueError(f"not a Kleinanzeigen ad URL: {url}")
    return Listing(id=f"kleinanzeigen:{match.group(1)}", source="kleinanzeigen", url=url, title="", price=None)


def build_search_url(
    criteria: SearchCriteria,
    page: int = 1,
    location_id: str | None = None,
    price_ceiling: int | None = None,
) -> str:
    max_price = price_ceiling if price_ceiling is not None else criteria.max_price
    path = ["s-autos"]
    if criteria.make:
        path.append(criteria.make)
    if criteria.min_price or max_price:
        path.append(f"preis:{criteria.min_price or ''}:{max_price or ''}")
    if page > 1:
        path.append(f"seite:{page}")
    if criteria.query.strip():
        path.append(quote(criteria.query.strip().lower().replace(" ", "-")))

    code = f"k0c{CARS_CATEGORY}" if criteria.query.strip() else f"c{CARS_CATEGORY}"
    if location_id:
        code += f"l{location_id}"
        if criteria.radius_km:
            code += f"r{criteria.radius_km}"

    def range_filter(name: str, low: int | None, high: int | None) -> str | None:
        if low is None and high is None:
            return None
        return f"autos.{name}:{low if low is not None else ''}%2C{high if high is not None else ''}"

    filters = [
        range_filter("ez_i", criteria.min_year, criteria.max_year),
        range_filter("km_i", criteria.min_km, criteria.max_km),
        f"autos.marke_s:{criteria.make}" if criteria.make else None,
        f"autos.model_s:{criteria.model}" if criteria.model else None,
        f"autos.fuel_s:{criteria.fuel}" if criteria.fuel else None,
        f"autos.shift_s:{criteria.gearbox}" if criteria.gearbox else None,
    ]
    path.append(code + "".join(f"+{f}" for f in filters if f))
    return f"{BASE_URL}/{'/'.join(path)}"


def _jsonld_description(article: Tag) -> str:
    for script in article.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.string or "")
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and data.get("description"):
            # The snippet arrives double-escaped ("&ndash;").
            return html_lib.unescape(str(data["description"]))
    return ""


def parse_search_results(html: str) -> list[Listing]:
    soup = BeautifulSoup(html, "html.parser")
    listings: list[Listing] = []
    for article in soup.select("article[data-adid]"):
        ad_id = article.get("data-adid")
        href = article.get("data-href") or ""
        title_link = article.select_one("h2 a, h3 a, a.ellipsis")
        if not ad_id or not href or title_link is None:
            continue

        listing = Listing(
            id=f"kleinanzeigen:{ad_id}",
            source="kleinanzeigen",
            url=BASE_URL + href,
            title=_clean(title_link.get_text()),
            price=None,
            description=_jsonld_description(article),
        )
        price_found = False
        for node in article.find_all(["p", "span", "div"]):
            if node.find(["p", "span", "div"]):
                continue  # only leaf elements carry the values we need
            text = _clean(node.get_text())
            if not price_found and (price := parse_price(text)) is not None:
                listing.price, listing.negotiable = price
                price_found = True
            elif m := _KM_RE.match(text):
                listing.km = _to_int(m.group(1))
            elif m := _EZ_RE.match(text):
                listing.month, listing.year = int(m.group(1)), int(m.group(2))
            elif not listing.location and _ZIP_CITY_RE.match(text):
                listing.location = text
        listings.append(listing)
    return listings


def parse_detail_page(html: str, listing: Listing) -> Listing:
    soup = BeautifulSoup(html, "html.parser")

    if title := soup.select_one("#viewad-title"):
        listing.title = _clean(title.get_text())
    if price_el := soup.select_one("#viewad-price"):
        if (price := parse_price(price_el.get_text())) is not None:
            listing.price, listing.negotiable = price
    if description := soup.select_one("#viewad-description-text"):
        listing.description = description.get_text("\n").strip()
    if locality := soup.select_one("#viewad-locality"):
        listing.location = _clean(locality.get_text())

    for item in soup.select("li.addetailslist--detail"):
        value_el = item.select_one(".addetailslist--detail--value")
        if value_el is None:
            continue
        value = _clean(value_el.get_text())
        value_el.extract()
        label = _clean(item.get_text())
        if label == "Marke":
            listing.make = value
        elif label == "Modell":
            listing.model = value
        elif label == "Kilometerstand":
            listing.km = _to_int(value) if re.search(r"\d", value) else listing.km
        elif label == "Erstzulassung":
            month, year = parse_month_year(value)
            listing.month, listing.year = month or listing.month, year or listing.year
        elif label == "Kraftstoffart":
            listing.fuel = value
        elif label == "Getriebe":
            listing.gearbox = value
        elif label == "Leistung" and re.search(r"\d", value):
            listing.power_ps = _to_int(value)
        elif label == "Fahrzeugzustand":
            listing.condition = value
        elif label == "HU bis":
            month, year = parse_month_year(value)
            listing.hu_until = f"{month or 1:02d}/{year}" if year else value

    listing.features = [_clean(li.get_text()) for li in soup.select("li.checktag")]
    for el in soup.select(".userprofile-vip-details-text"):
        text = _clean(el.get_text())
        if text.startswith(("Gewerblicher", "Privater")):
            listing.seller_type = "dealer" if text.startswith("Gewerblicher") else "private"
            break
    listing.details_loaded = True
    return listing


class KleinanzeigenSource:
    name = "kleinanzeigen"

    def __init__(
        self,
        settings: ScraperSettings | None = None,
        session: requests.Session | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.settings = settings or ScraperSettings()
        self.session = session or requests.Session()
        self.session.headers.update(
            {"User-Agent": USER_AGENT, "Accept-Language": "de-DE,de;q=0.9"}
        )
        self._sleep = sleep
        self._has_requested = False
        self._location_ids: dict[str, str | None] = {}

    def _get(self, url: str) -> str:
        # Stay slow and polite: a random pause before every request but the first.
        if self._has_requested:
            self._sleep(random.uniform(self.settings.min_delay_seconds, self.settings.max_delay_seconds))
        self._has_requested = True

        for attempt in range(3):
            response = self.session.get(url, timeout=self.settings.timeout_seconds)
            if response.status_code in (403, 429):
                raise SourceBlockedError(f"Kleinanzeigen answered {response.status_code} for {url}")
            if response.status_code >= 500 and attempt < 2:
                self._sleep(10 * (attempt + 1))
                continue
            response.raise_for_status()
            return response.text
        raise RuntimeError("unreachable")

    def resolve_location(self, zip_code: str) -> str | None:
        """Turns a ZIP code into Kleinanzeigen's internal location id."""
        if zip_code not in self._location_ids:
            raw = self._get(f"{BASE_URL}/s-ort-empfehlungen.json?query={quote(zip_code)}")
            suggestions = json.loads(raw)
            ids = [key.lstrip("_") for key in suggestions if key != "_0"]
            self._location_ids[zip_code] = ids[0] if ids else None
            if not ids:
                log.warning("No Kleinanzeigen location found for ZIP %s, searching nationwide", zip_code)
        return self._location_ids[zip_code]

    def search(self, criteria: SearchCriteria, price_ceiling: int | None = None) -> list[Listing]:
        location_id = self.resolve_location(criteria.zip_code) if criteria.zip_code else None
        found: dict[str, Listing] = {}
        for page in range(1, criteria.pages + 1):
            url = build_search_url(criteria, page, location_id, price_ceiling)
            html = self._get(url)
            results = parse_search_results(html)
            for listing in results:
                found.setdefault(listing.id, listing)
            log.info("%s page %d: %d listings", criteria.name, page, len(results))
            if not results or f"seite:{page + 1}" not in html:
                break
        return list(found.values())

    def fetch_details(self, listing: Listing) -> Listing:
        if listing.details_loaded:
            return listing
        return parse_detail_page(self._get(listing.url), listing)
