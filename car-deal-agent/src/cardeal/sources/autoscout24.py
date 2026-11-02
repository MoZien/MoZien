"""AutoScout24 ads: a pasted link is read from the ad page's embedded data (__NEXT_DATA__) and turned
into a Listing with Kleinanzeigen's filter values, so the car is valued against the same private
market as every other one. Only single ads the user asks for are fetched, one request each."""

from __future__ import annotations

import html
import json
import re
import threading
import time

import requests

from cardeal.config import ScraperSettings
from cardeal.models import Listing
from cardeal.sources.base import SourceBlockedError
from cardeal.sources.kleinanzeigen import make_slug

AD_URL = re.compile(r"^https?://(?:www\.)?autoscout24\.[a-z.]{2,6}/angebote/[^\s?#]+", re.IGNORECASE)
NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.DOTALL)
BROWSER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)
MAX_PHOTOS = 12

# AutoScout24 wording -> Kleinanzeigen filter values
BODIES = {
    "kleinwagen": "kleinwagen", "limousine": "limousine", "kombi": "kombi", "cabrio": "cabrio",
    "coupé": "coupe", "coupe": "coupe", "suv/geländewagen/pickup": "suv", "suv": "suv",
    "van/kleinbus": "bus", "transporter": "bus",
}


def is_autoscout24(url: str) -> bool:
    return bool(AD_URL.match(url.strip()))


def fuel_slug(formatted: str | None) -> str | None:
    text = (formatted or "").lower()
    if "elektro/" in text or "hybrid" in text:
        return "hybrid"
    for word, slug in (("benzin", "benzin"), ("super", "benzin"), ("diesel", "diesel"), ("elektro", "elektro"),
                       ("autogas", "lpg"), ("lpg", "lpg"), ("erdgas", "cng"), ("cng", "cng")):
        if word in text:
            return slug
    return None


def gearbox_slug(transmission: str | None) -> str | None:
    text = (transmission or "").lower()
    if "automatik" in text:  # also "Halbautomatik"
        return "automatik"
    if "schalt" in text:
        return "manuell"
    return None


def _text(value) -> str:
    """Plain text from AutoScout24's description (HTML or None)."""
    raw = re.sub(r"<br\s*/?>|</p>|</li>", "\n", str(value or ""), flags=re.IGNORECASE)
    return html.unescape(re.sub(r"<[^>]+>", " ", raw)).strip()


def parse_ad(page: str, url: str) -> Listing:
    """The ad on an AutoScout24 detail page. Raises ValueError when the page holds no car ad."""
    match = NEXT_DATA.search(page)
    if not match:
        raise ValueError("no ad data on the page")
    details = (json.loads(match.group(1)).get("props", {}).get("pageProps", {}) or {}).get("listingDetails")
    if not details or not details.get("vehicle"):
        raise ValueError("no ad data on the page")
    vehicle = details["vehicle"]
    public = (details.get("prices") or {}).get("public") or {}

    make = vehicle.get("make")
    model = vehicle.get("modelGroup") or vehicle.get("model")
    registration = re.match(r"(\d{4})-(\d{2})", vehicle.get("firstRegistrationDateRaw") or "")
    location = details.get("location") or {}
    seller = details.get("seller") or {}
    damaged = bool(vehicle.get("damageConditions")) or vehicle.get("hadAccident") is True
    body = (vehicle.get("bodyType") or "").strip()
    fuel = (vehicle.get("fuelCategory") or {}).get("formatted")
    title = " ".join(part for part in (details.get("title"), vehicle.get("modelVersionInput")) if part)
    description = _text(details.get("description"))
    if vehicle.get("noOfPreviousOwners"):
        description += f"\nVorbesitzer: {vehicle['noOfPreviousOwners']}"
    if vehicle.get("hasFullServiceHistory"):
        description += "\nScheckheftgepflegt"

    return Listing(
        id=f"autoscout24:{details.get('id')}",
        source="autoscout24",
        url=url.split("#", 1)[0].split("?", 1)[0],
        title=title or f"{make} {model}",
        price=None if public.get("onRequestOnly") else public.get("priceRaw"),
        negotiable=bool(public.get("negotiable")),
        km=vehicle.get("mileageInKmRaw"),
        year=int(registration.group(1)) if registration else None,
        month=int(registration.group(2)) if registration else None,
        location=" ".join(str(part) for part in (location.get("zip"), location.get("city")) if part),
        description=description,
        make=make,
        model=model,
        fuel=fuel,
        gearbox=vehicle.get("transmissionType"),
        power_ps=vehicle.get("rawPowerInHp"),
        condition="Beschädigtes Fahrzeug" if damaged else None,
        hu_until=vehicle.get("nextVehicleSafetyInspection") or None,
        seller_type="dealer" if seller.get("isDealer") else "private",
        details_loaded=True,
        body_type=body or None,
        # Kleinanzeigen filter values; the model is searched by its name (spellings differ).
        make_slug=make_slug(make) if make else None,
        fuel_slug=fuel_slug(fuel),
        gearbox_slug=gearbox_slug(vehicle.get("transmissionType")),
        body_slug=BODIES.get(body.lower()),
        images=list(dict.fromkeys(details.get("images") or []))[:MAX_PHOTOS],
    )


class AutoScout24Source:
    """Fetches single AutoScout24 ads, politely: one at a time with a pause in between."""

    name = "autoscout24"

    def __init__(self, settings: ScraperSettings | None = None, session: requests.Session | None = None):
        self.settings = settings or ScraperSettings()
        self.session = session or requests.Session()
        self.session.headers.update({"User-Agent": BROWSER_AGENT, "Accept-Language": "de-DE,de;q=0.9",
                                     "Accept": "text/html,application/xhtml+xml"})
        self._lock = threading.Lock()
        self._last = 0.0

    def fetch(self, url: str) -> Listing:
        with self._lock:
            wait = self.settings.min_delay_seconds - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            response = self.session.get(url, timeout=self.settings.timeout_seconds)
            self._last = time.monotonic()
        if response.status_code in (403, 429):
            raise SourceBlockedError(f"AutoScout24 answered {response.status_code}")
        response.raise_for_status()
        return parse_ad(response.text, url)
