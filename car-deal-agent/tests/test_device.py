"""Device mode: the job asks the app to load every marketplace page and keeps no ads."""

import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from test_web import AD, FakeClaude, FakeKleinanzeigen

from cardeal.config import ScraperSettings
from cardeal.web import device as device_module
from cardeal.web import service as service_module
from cardeal.web.app import create_app
from cardeal.web.auth import Access
from cardeal.web.device import DeviceLink
from cardeal.web.jobs import Job, JobCancelled, JobManager
from cardeal.web.service import CarService

FIXTURES = Path(__file__).parent / "fixtures"
DETAIL = (FIXTURES / "detail_page.html").read_text(encoding="utf-8")  # VW Golf VII 1.2 TSI, 6,200 EUR


def results_page(n=15) -> str:
    """A Kleinanzeigen results page with n comparable Golfs around 9,000 EUR."""
    ads = "".join(
        f'<article data-adid="9{i:03d}" data-href="/s-anzeige/vw-golf/9{i:03d}-216-1">'
        f'<h2><a href="/s-anzeige/vw-golf/9{i:03d}-216-1">VW Golf 1.2 TSI</a></h2>'
        f"<p>{8_800 + i * 50:,} € VB</p><span>{66_000 + i * 1000:,} km</span>"
        f"<span>EZ 06/2014</span><span>06108 Halle</span></article>".replace(",", ".")
        for i in range(n))
    return f"<html><body>{ads}</body></html>"


def marketplace(url: str) -> tuple[int, str]:
    if "s-ort-empfehlungen" in url:
        return 200, '{"_0":"Deutschland","_9668":"06108 Halle"}'
    if "/s-anzeige/" in url:
        return 200, DETAIL
    return 200, results_page()


class Phone:
    """Plays the user's device: loads every page the job asks for and posts it back (up to `limit`)."""

    def __init__(self, client, limit=None):
        self.client, self.limit, self.urls = client, limit, []

    def run(self, job_id: str, timeout: float = 20) -> dict:
        since, deadline = -1, time.time() + timeout
        while time.time() < deadline:
            job = self.client.get(f"/api/jobs/{job_id}", params={"since": since, "wait": 1}).json()
            while job["status"] not in ("done", "error", "cancelled") and job["partial"].get("fetch"):
                if self.limit is not None and len(self.urls) >= self.limit:
                    break  # the phone went away
                fetch = job["partial"]["fetch"]
                self.urls.append(fetch["url"])
                status, body = marketplace(fetch["url"])
                job = self.client.post(f"/api/jobs/{job_id}/fetch",
                                       json={"id": fetch["id"], "status": status, "url": fetch["url"], "body": body}).json()
                assert job["delivered"] is True
            if job["status"] in ("done", "error", "cancelled"):
                return job
            since = job["version"]
        raise AssertionError("job did not finish")


@pytest.fixture
def quick(monkeypatch):
    monkeypatch.setattr(service_module, "DEVICE_SCRAPER", ScraperSettings(min_delay_seconds=0, max_delay_seconds=0))


def device_client(tmp_path, monkeypatch=None, mode=None):
    if mode and monkeypatch:
        monkeypatch.setenv("FETCH_MODE", mode)
    server_source = FakeKleinanzeigen()
    service = CarService(str(tmp_path / "cache.sqlite3"), Access(None, "s"), source=server_source, ai_client=FakeClaude())
    client = TestClient(create_app(service=service, access=service.access, jobs=JobManager()))
    return client, service, server_source


def test_analysis_loads_every_page_on_the_device_and_keeps_no_ads(tmp_path, quick):
    client, service, server_source = device_client(tmp_path)
    started = client.post("/api/jobs/analyze", json={"url": AD, "device": True, "prefs": {"ai_enabled": False}}).json()
    assert started["device"] is True
    phone = Phone(client)
    job = phone.run(started["job_id"])

    assert job["status"] == "done", job
    result = job["result"]
    assert result["listing"]["title"] == "VW Golf VII 1.2 TSI" and result["listing"]["price"] == 6200
    assert 8_800 <= result["valuation"]["market_price"] <= 9_600 and result["valuation"]["comparables"] >= 5
    assert phone.urls[0] == AD and all(url.startswith("https://www.kleinanzeigen.de/") for url in phone.urls)
    # the server itself loaded nothing and stored no ad
    assert server_source.searches == [] and server_source.detail_calls == []
    assert service.store.db.execute("SELECT COUNT(*) FROM listings").fetchone()[0] == 0


def test_a_closed_app_ends_the_job_with_a_clear_reason(tmp_path, quick, monkeypatch):
    monkeypatch.setattr(device_module, "DEVICE_WAIT_SECONDS", 0.3)
    client, _, _ = device_client(tmp_path)
    started = client.post("/api/jobs/analyze", json={"url": AD, "device": True}).json()
    deadline = time.time() + 5
    while (job := client.get(f"/api/jobs/{started['job_id']}").json())["status"] not in ("done", "error"):
        assert time.time() < deadline
        time.sleep(0.05)
    assert job["error"] == {"code": "device_gone"}


def test_hunt_keeps_its_finds_when_the_app_is_closed(tmp_path, quick, monkeypatch):
    monkeypatch.setattr(device_module, "DEVICE_WAIT_SECONDS", 0.5)
    client, service, server_source = device_client(tmp_path)
    body = {"device": True, "criteria": {"count": 5, "max_ads": 5, "max_price": 10_000, "min_price": 500,
                                         "min_year": 2010, "skip_ids": []},
            "prefs": {"purpose": "trade", "ai_in_hunt": False}}
    started = client.post("/api/jobs/hunt", json=body).json()
    phone = Phone(client, limit=6)  # location, results, then a few ads; then the app is closed
    job = phone.run(started["job_id"])

    assert job["status"] == "done", job
    assert job["result"]["stopped"] == "device"
    assert job["result"]["checked"] >= 1 and server_source.searches == []
    assert service.store.db.execute("SELECT COUNT(*) FROM listings").fetchone()[0] == 0


def test_long_poll_answers_as_soon_as_a_page_is_needed(tmp_path, quick):
    client, _, _ = device_client(tmp_path)
    started = client.post("/api/jobs/analyze", json={"url": AD, "device": True}).json()
    job = client.get(f"/api/jobs/{started['job_id']}").json()
    begin = time.time()
    while not job["partial"].get("fetch"):  # wait for the first page request, without polling
        job = client.get(f"/api/jobs/{started['job_id']}", params={"since": job["version"], "wait": 5}).json()
    assert job["partial"]["fetch"]["url"] == AD and time.time() - begin < 3
    # a request that already knows the current version waits ...
    begin = time.time()
    same = client.get(f"/api/jobs/{started['job_id']}", params={"since": job["version"], "wait": 0.5}).json()
    assert same["version"] == job["version"] and time.time() - begin >= 0.4
    # ... and cancelling wakes it
    client.post(f"/api/jobs/{started['job_id']}/cancel")
    ended = client.get(f"/api/jobs/{started['job_id']}", params={"since": job["version"], "wait": 5}).json()
    assert ended["version"] > job["version"]


@pytest.mark.parametrize("mode, device, expected", [
    ("device", False, "needs_device"), ("device", True, True), ("server", True, False), ("both", False, False),
])
def test_fetch_mode(tmp_path, monkeypatch, quick, mode, device, expected):
    client, _, _ = device_client(tmp_path, monkeypatch, mode)
    assert client.get("/api/meta").json()["fetch_mode"] == mode
    answer = client.post("/api/jobs/analyze", json={"url": AD, "device": device}).json()
    if expected == "needs_device":
        assert answer["error"]["code"] == "needs_device"
    else:
        assert answer["device"] is expected
        client.post(f"/api/jobs/{answer['job_id']}/cancel")


def test_device_link_rules():
    job = Job(id="j", kind="analyze", owner="o", steps=[])
    link = DeviceLink(job, wait_seconds=5)
    with pytest.raises(ValueError):
        link.get("https://evil.example.com/s-anzeige/1")  # only marketplace pages are ever requested
    assert link.deliver(1, 200, "x", "u") is False  # nothing waits

    got = {}
    worker = threading.Thread(target=lambda: got.update(page=link.get("https://www.autohero.com/de/x/id/1/")))
    worker.start()
    while "fetch" not in job.partial:
        time.sleep(0.01)
    assert link.deliver(job.partial["fetch"]["id"] + 1, 200, "x", "u") is False  # wrong request
    assert link.deliver(job.partial["fetch"]["id"], 404, "gone", "https://www.autohero.com/de/x/id/1/")
    worker.join(2)
    assert got["page"].status_code == 404 and "fetch" not in job.partial

    stopped = {}

    def wait_and_get_cancelled():
        try:
            link.get("https://www.kleinanzeigen.de/s-anzeige/x/1")
        except JobCancelled:
            stopped["at"] = time.time()

    worker = threading.Thread(target=wait_and_get_cancelled)
    worker.start()
    time.sleep(0.1)
    job.cancel_event.set()
    job.touch()
    worker.join(2)
    assert "at" in stopped


def test_native_app_origins_may_call_the_api(tmp_path):
    client, _, _ = device_client(tmp_path)
    ok = client.get("/api/meta", headers={"Origin": "capacitor://localhost"})
    assert ok.headers.get("access-control-allow-origin") == "capacitor://localhost"
    assert ok.headers.get("access-control-allow-credentials") == "true"
    other = client.get("/api/meta", headers={"Origin": "https://evil.example.com"})
    assert "access-control-allow-origin" not in other.headers
