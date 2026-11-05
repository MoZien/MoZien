"""The ad's photos for the AI review: which ones, at what size, and how they are loaded.

In device mode the user's device loads them (like the ad itself, see device.py); only in server
mode does the server load them. They are sent to the AI with the ad and not kept.
"""

from __future__ import annotations

import base64
import binascii
import logging
import re

import requests

from cardeal.analyzer import Photo

log = logging.getLogger(__name__)

MAX_PHOTOS = 6
MAX_PHOTO_BYTES = 3_500_000  # as base64 still below the API's 5 MB per image
# The marketplaces' photo servers (they allow other sites to load the photos).
PHOTO_URL = re.compile(
    r"^https://(?:img\.kleinanzeigen\.de|prod\.pictures\.autoscout24\.net|img-[a-z0-9-]+\.autohero\.com)/",
    re.IGNORECASE)
BROWSER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36"
)


def ai_photo_choice(images: list[str], limit: int = MAX_PHOTOS) -> dict[str, int]:
    """The ad's first photos, each in a size of about 1000 px where details are visible: URL -> the
    photo's place in the ad's photo list (the app shows that one next to a finding). The app picks
    the same URLs (aiPhotoUrls in frontend/src/lib/photos.ts): keep the two alike."""
    choice: dict[str, int] = {}
    for index, url in enumerate(images):
        if not PHOTO_URL.match(url or ""):
            continue
        url = re.sub(r"rule=\$_\d+\.AUTO", "rule=$_59.AUTO", url)  # Kleinanzeigen: 960 px
        url = re.sub(r"/\d+x\d+\.webp$", "/1280x960.webp", url)  # AutoScout24
        url = re.sub(r"/\d+x\d+-([0-9a-f]+\.jpg)$", r"/1116x744-\1", url)  # Autohero
        choice.setdefault(url, index)
        if len(choice) == limit:
            break
    return choice


def ai_photo_urls(images: list[str], limit: int = MAX_PHOTOS) -> list[str]:
    return list(ai_photo_choice(images, limit))


def media_type(data: bytes) -> str | None:
    """The image type from the file's first bytes (servers don't always say it right)."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return None


def photo_from_base64(text: str, url: str = "") -> Photo | None:
    """A photo the device sent (base64); None if it isn't a usable image."""
    if not isinstance(text, str) or not 100 <= len(text) <= MAX_PHOTO_BYTES * 4 // 3 + 4:
        return None
    try:
        data = base64.b64decode(text, validate=True)
    except (binascii.Error, ValueError):
        return None
    kind = media_type(data)
    return Photo(kind, text, url) if kind else None


def photos_from_device(items: object, urls: list[str]) -> list[Photo]:
    """The photos a device sent, as [{"url", "data"}]: only usable images of the URLs asked for, in
    the order they were asked for, each once."""
    if not isinstance(items, list):
        return []
    sent = {item["url"]: item.get("data") for item in items[:50]
            if isinstance(item, dict) and isinstance(item.get("url"), str)}
    photos = [photo_from_base64(sent[url], url) for url in urls if url in sent]
    return [photo for photo in photos if photo is not None]


def load_on_server(urls: list[str], session: requests.Session | None = None, timeout: float = 15) -> list[Photo]:
    """Server mode only: the server loads the photos itself."""
    session = session or requests.Session()
    photos: list[Photo] = []
    for url in urls:
        try:
            response = session.get(url, timeout=timeout, headers={"User-Agent": BROWSER_AGENT})
        except requests.RequestException as exc:
            log.info("photo %s not loaded: %s", url, exc)
            continue
        data = response.content
        kind = media_type(data) if response.status_code == 200 and len(data) <= MAX_PHOTO_BYTES else None
        if kind:
            photos.append(Photo(kind, base64.b64encode(data).decode("ascii"), url))
    return photos
