"""Pages loaded by the user's device instead of the server.

In device mode a job does not contact the marketplaces itself. When one of its sources needs a
page, the job asks the app for it (`job.partial["fetch"] = {"id", "url"}`); the app loads the page
on the phone (native app) or in the browser (AutoHalle extension) and posts it back
(POST /api/jobs/{id}/fetch). The marketplaces see ordinary visitors loading a few pages each, and
the server only computes: it keeps no ads (each device job values against its own in-memory store).

The sources don't notice: they get a `DeviceSession` where they would get a `requests.Session`.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import requests

from cardeal.analyzer import Photo
from cardeal.config import ScraperSettings
from cardeal.web.jobs import JobCancelled, UserFacingError
from cardeal.web.photos import PHOTO_URL, photos_from_device

if TYPE_CHECKING:
    from cardeal.web.jobs import Job

# Only these sites are ever asked for (the app checks the same list before it loads anything).
ALLOWED_URL = re.compile(
    r"^https://(?:www\.)?(?:kleinanzeigen\.de|autoscout24\.[a-z]{2,3}(?:\.[a-z]{2})?|autohero\.com)/", re.IGNORECASE)
# How long a job waits for the device to deliver a page before it gives up (app closed, offline).
DEVICE_WAIT_SECONDS = 45.0
# Pauses between pages: one person's device, so a human pace instead of the server's long pauses.
DEVICE_SCRAPER = ScraperSettings(min_delay_seconds=1.0, max_delay_seconds=2.5, timeout_seconds=30.0)
MAX_PAGE_CHARS = 6_000_000


class DeviceGone(UserFacingError):
    """The device stopped answering (app closed or in the background, no connection)."""

    def __init__(self):
        super().__init__("device_gone")


@dataclass
class DeviceResponse:
    """The part of a requests.Response the sources use."""

    status_code: int
    text: str
    url: str
    headers: dict = field(default_factory=dict)

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code} for {self.url}", response=self)


class DeviceLink:
    """One job's line to the device: one page request at a time, answered by `deliver`."""

    def __init__(self, job: Job, wait_seconds: float | None = None):
        self.job = job
        self.wait_seconds = DEVICE_WAIT_SECONDS if wait_seconds is None else wait_seconds
        self._next_id = 0
        self._pending: dict | None = None
        self._answer: dict | None = None
        self.pages = 0

    def get(self, url: str) -> DeviceResponse:
        """Asks the device for the page `url` and waits for it (called from the job's thread)."""
        if not ALLOWED_URL.match(url):
            raise ValueError(f"not a marketplace page: {url}")
        answer = self._ask({"url": url})
        if answer.get("error"):
            raise requests.ConnectionError(f"device could not load the page: {answer['error']}")
        self.pages += 1
        return DeviceResponse(int(answer.get("status") or 0), answer.get("body") or "", answer.get("url") or url)

    def get_photos(self, urls: list[str]) -> list[Photo]:
        """Asks the device for the ad's photos in one go (it loads them itself, makes them smaller
        and sends them as base64 JPEGs). Photos it couldn't load are left out."""
        urls = [url for url in urls if PHOTO_URL.match(url)]
        if not urls:
            return []
        answer = self._ask({"kind": "photos", "urls": urls})
        if answer.get("error"):
            return []
        try:
            items = json.loads(answer.get("body") or "[]")
        except ValueError:
            return []
        return photos_from_device(items, urls)

    def _ask(self, request: dict) -> dict:
        """Puts one request where the app sees it and waits for the device's answer."""
        job = self.job
        with job.cond:
            self._next_id += 1
            self._pending, self._answer = {"id": self._next_id, **request}, None
            job.partial["fetch"] = dict(self._pending)
            job.touch()
            deadline = time.monotonic() + self.wait_seconds
            try:
                while self._answer is None:
                    if job.cancel_event.is_set():
                        raise JobCancelled()
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise DeviceGone()
                    job.cond.wait(min(remaining, 1.0))
                return self._answer
            finally:
                self._pending = self._answer = None
                job.partial.pop("fetch", None)
                job.touch()

    def deliver(self, fetch_id: int, status: int, body: str, url: str, error: str | None = None) -> bool:
        """The device's answer (called from the API thread). False if nothing waits for it."""
        with self.job.cond:
            if self._pending is None or self._pending["id"] != fetch_id:
                return False
            self._answer = {"status": status, "body": body, "url": url, "error": error}
            self.job.cond.notify_all()
            return True


class DeviceSession:
    """Stands in for requests.Session in the sources: every GET goes to the device."""

    def __init__(self, link: DeviceLink):
        self.link = link
        self.headers: dict = {}  # the sources set browser headers; the device sends its own

    def get(self, url: str, timeout: float | None = None, **_) -> DeviceResponse:
        return self.link.get(url)


def wait_for_change(job: Job, since: int | None, seconds: float) -> None:
    """Long poll: returns once the job's version is past `since`, the job has ended, or after
    `seconds`. (A delivered page moves the version once when the job takes it and again when the
    job asks for the next page or ends, so the delivery's answer waits past `version + 1`.)"""
    if since is None or seconds <= 0:
        return
    with job.cond:
        job.cond.wait_for(lambda: job.version > since or job.status in ("done", "error", "cancelled"),
                          timeout=seconds)

