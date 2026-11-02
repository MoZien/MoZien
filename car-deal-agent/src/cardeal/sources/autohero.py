"""Autohero ads: a pasted link is read from the page's schema.org Vehicle data (JSON-LD) and turned
into a Listing with Kleinanzeigen's filter values, so the car is valued against the same private
market as every other one. Autohero is a dealer (fixed prices, warranty, delivery); only single ads
the user asks for are fetched, one request each."""

from __future__ import annotations

import html
import json
import re
import threading
import time

import requests

from cardeal.config import ScraperSettings
from cardeal.models import Listing
from cardeal.sources.autoscout24 import BODIES, BROWSER_AGENT, fuel_slug, gearbox_slug
from cardeal.sources.base import SourceBlockedError
from cardeal.sources.kleinanzeigen import make_slug

AD_URL = re.compile(r"^https?://(?:www\.)?autohero\.com/[a-z]{2}/[^/\s]+/id/([0-9a-f-]{36})/?", re.IGNORECASE)
JSON_LD = re.compile(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', re.DOTALL)
# Photos come in many sizes: .../img/<car>/<exterior|interior>/<n>/<width>x<height>-<photo>.jpg
PHOTO = re.compile(r"(https://img-[a-z0-9-]+\.autohero\.com/img/[0-9a-f]+/[a-z]+/\d+/)\d+x\d+-([0-9a-f]+\.jpg)")
PHOTO_SIZE = "1116x744"
HU = re.compile(r"HU/AU gültig bis:\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})")
MAX_PHOTOS = 12


def is_autohero(url: str) -> bool:
    return bool(AD_URL.match(url.strip()))


def _vehicle(page: str) -> dict | None:
    """The first schema.org Vehicle/Car in the page's JSON-LD blocks (also inside @graph or lists)."""
    for block in JSON_LD.findall(page):
        try:
            data = json.loads(html.unescape(block))
        except ValueError:
            continue
        stack = [data]
        while stack:
            item = stack.pop(0)
            if isinstance(item, list):
                stack.extend(item)
            elif isinstance(item, dict):
                kinds = item.get("@type")
                kinds = kinds if isinstance(kinds, list) else [kinds]
                if any(kind in ("Vehicle", "Car", "Motorcycle") for kind in kinds):
                    return item
                stack.extend(item.get("@graph") or [])
    return None


def _name(value) -> str | None:
    if isinstance(value, dict):
        value = value.get("name")
    return str(value).strip() or None if value else None


def _number(value) -> int | None:
    """67142 from 67142, "67.142 KMT" or {"value": "67142", "unitCode": "KMT"}."""
    if isinstance(value, dict):
        value = value.get("value")
    if isinstance(value, (int, float)):
        return int(value)
    digits = re.sub(r"[.\s]", "", str(value or "")).split(",")[0]
    match = re.search(r"\d+", digits)
    return int(match.group()) if match else None


def _power_ps(engine: dict) -> int | None:
    power = engine.get("enginePower")
    if isinstance(power, dict):
        value, unit = _number(power), str(power.get("unitCode") or "").upper()
        if value is None:
            return None
        return round(value * 1.35962) if unit == "KWT" else value  # BHP/PS stay as they are
    text = str(power or "")
    if match := re.search(r"(\d+)\s*PS", text):
        return int(match.group(1))
    if match := re.search(r"(\d+)\s*kW", text, re.IGNORECASE):
        return round(int(match.group(1)) * 1.35962)
    return None


def _body_slug(body: str) -> str | None:
    """"SUV / Geländewagen" -> "suv"; the AutoScout24 spellings are the same."""
    text = re.sub(r"\s*/\s*", "/", body.strip().lower())
    return BODIES.get(text) or BODIES.get(text.split("/")[0])


def _photos(page: str, first) -> list[str]:
    """Every photo once, in page order, in one large size."""
    found = []
    for source in [*(first if isinstance(first, list) else [first] if first else []), *PHOTO.findall(page)]:
        if isinstance(source, str):
            match = PHOTO.match(source)
            if not match:
                found.append(source)
                continue
            source = match.groups()
        found.append(f"{source[0]}{PHOTO_SIZE}-{source[1]}")
    return list(dict.fromkeys(found))[:MAX_PHOTOS]


def parse_ad(page: str, url: str) -> Listing:
    """The car on an Autohero detail page. Raises ValueError when the page holds no car."""
    vehicle = _vehicle(page)
    match = AD_URL.match(url.strip())
    if not vehicle or not match:
        raise ValueError("no car on the page")
    offer = vehicle.get("offers") or {}
    offer = offer[0] if isinstance(offer, list) and offer else offer
    engine = vehicle.get("vehicleEngine") or {}
    engine = engine[0] if isinstance(engine, list) and engine else engine
    make = _name(vehicle.get("brand")) or _name(vehicle.get("manufacturer"))
    model = _name(vehicle.get("model"))
    registered = re.match(r"(\d{4})(?:-(\d{1,2}))?", str(vehicle.get("dateVehicleFirstRegistered")
                                                      or vehicle.get("dateVehiclefirstregistered") or ""))
    fuel = _name(engine.get("fuelType")) or _name(vehicle.get("fuelType"))
    gearbox = _name(vehicle.get("vehicleTransmission"))
    body = _name(vehicle.get("bodyType")) or ""
    hu = HU.search(page)
    owners = _number(vehicle.get("numberOfPreviousOwners"))
    description = html.unescape(str(vehicle.get("description") or "")).strip()
    if owners is not None:
        description += f"\nVorbesitzer: {owners}"
    price = _number(offer.get("price"))

    return Listing(
        id=f"autohero:{match.group(1).lower()}",
        source="autohero",
        url=match.group(0) if match.group(0).endswith("/") else match.group(0) + "/",
        title=_name(vehicle.get("name")) or " ".join(part for part in (make, model) if part),
        price=price,
        negotiable=False,  # fixed prices
        km=_number(vehicle.get("mileageFromOdometer")),
        year=int(registered.group(1)) if registered else None,
        month=int(registered.group(2)) if registered and registered.group(2) else None,
        location="",  # delivered anywhere in Germany
        description=description,
        make=make,
        model=model,
        fuel=fuel,
        gearbox=gearbox,
        power_ps=_power_ps(engine),
        hu_until=f"{int(hu.group(2)):02d}/{2000 + int(hu.group(3)) % 100}" if hu else None,
        seller_type="dealer",
        details_loaded=True,
        body_type=body or None,
        # Kleinanzeigen filter values; the model is searched by its name (spellings differ).
        make_slug=make_slug(make) if make else None,
        fuel_slug=fuel_slug(fuel),
        gearbox_slug=gearbox_slug(gearbox),
        body_slug=_body_slug(body),
        images=_photos(page, vehicle.get("image")),
    )


class AutoheroSource:
    """Fetches single Autohero ads, politely: one at a time with a pause in between."""

    name = "autohero"

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
            raise SourceBlockedError(f"Autohero answered {response.status_code}")
        response.raise_for_status()
        return parse_ad(response.text, url)
