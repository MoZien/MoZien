"""The ad's photos for the AI review: which ones, at what size, and what counts as a photo."""

import base64
import json
import threading
import time
from types import SimpleNamespace

import requests

from cardeal.analyzer import ListingAnalyzer, Photo
from cardeal.config import AISettings
from cardeal.web.device import DeviceLink
from cardeal.web.jobs import Job
from cardeal.web.photos import (
    MAX_PHOTO_BYTES,
    ai_photo_choice,
    ai_photo_urls,
    load_on_server,
    media_type,
    photo_from_base64,
)

JPEG = b"\xff\xd8\xff\xe0" + bytes(200)
PNG = b"\x89PNG\r\n\x1a\n" + bytes(200)
WEBP = b"RIFF" + bytes(4) + b"WEBP" + bytes(200)
KLEINANZEIGEN = "https://img.kleinanzeigen.de/api/v1/prod-ads/images/7d/7d5b0c1e-aa?rule=$_{}.AUTO"
AUTOSCOUT24 = ("https://prod.pictures.autoscout24.net/listing-images/e5ce50e1-189a_a0433525-5115.jpg/{}.webp")
AUTOHERO = ("https://img-eu-c1.autohero.com/img/12aeb4fd/exterior/1/{}-2b563cd0cec24866aa8c75da735334d7.jpg")


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def test_photo_urls_ask_each_site_for_a_size_where_details_show():
    images = [
        KLEINANZEIGEN.format(2), KLEINANZEIGEN.format(57),  # the same photo in two sizes
        AUTOSCOUT24.format("250x188"), AUTOHERO.format("120x80"),
        "https://evil.example.com/photo.jpg", "http://img.kleinanzeigen.de/api/v1/x?rule=$_2.AUTO", "",
    ]
    assert ai_photo_urls(images) == [KLEINANZEIGEN.format(59), AUTOSCOUT24.format("1280x960"),
                                     AUTOHERO.format("1116x744")]
    assert list(ai_photo_choice(images).values()) == [0, 2, 3]  # where each photo is in the ad
    many = [f"https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/{i}?rule=$_2.AUTO" for i in range(10)]
    assert len(ai_photo_urls(many)) == 6 and len(ai_photo_urls(many, limit=2)) == 2


def test_only_real_images_count():
    assert [media_type(data) for data in (JPEG, PNG, WEBP, b"GIF89a" + bytes(10), b"<html>", b"")] == [
        "image/jpeg", "image/png", "image/webp", "image/gif", None, None]
    assert photo_from_base64(b64(JPEG)) == Photo("image/jpeg", b64(JPEG))
    assert photo_from_base64(b64(b"<html>" + bytes(200))) is None  # not an image
    assert photo_from_base64("not base64 at all!" * 10) is None
    assert photo_from_base64(b64(JPEG[:20])) is None  # too small to show anything
    assert photo_from_base64(None) is None and photo_from_base64({"data": "x"}) is None
    too_big = "A" * (MAX_PHOTO_BYTES * 4 // 3 + 8)
    assert photo_from_base64(too_big) is None


class FakeSession:
    def __init__(self, answers):
        self.answers, self.calls = answers, []

    def get(self, url, timeout, headers):
        self.calls.append((url, headers["User-Agent"]))
        answer = self.answers[url]
        if isinstance(answer, Exception):
            raise answer
        status, content = answer
        return SimpleNamespace(status_code=status, content=content)


def test_server_mode_loads_the_photos_and_leaves_out_what_failed():
    session = FakeSession({
        "https://a/1.jpg": (200, JPEG), "https://a/2.jpg": (404, b"gone"), "https://a/3.jpg": (200, b"<html>"),
        "https://a/4.jpg": requests.ConnectionError("down"), "https://a/5.webp": (200, WEBP),
        "https://a/6.jpg": (200, JPEG + bytes(MAX_PHOTO_BYTES)),
    })
    photos = load_on_server(list(session.answers), session=session)
    assert photos == [Photo("image/jpeg", b64(JPEG), "https://a/1.jpg"), Photo("image/webp", b64(WEBP), "https://a/5.webp")]
    assert len(session.calls) == 6 and all("Mozilla" in agent for _, agent in session.calls)


def test_device_mode_asks_the_device_for_all_photos_in_one_go():
    job = Job(id="j", kind="analyze", owner="o", steps=[])
    link = DeviceLink(job, wait_seconds=5)
    assert link.get_photos(["https://evil.example.com/1.jpg"]) == []  # never asks for other sites' files
    urls = [KLEINANZEIGEN.format(59), AUTOSCOUT24.format("1280x960")]
    got = {}
    worker = threading.Thread(target=lambda: got.update(photos=link.get_photos(urls + ["https://evil.example.com/x"])))
    worker.start()
    while "fetch" not in job.partial:
        time.sleep(0.01)
    errand = job.partial["fetch"]
    assert errand["kind"] == "photos" and errand["urls"] == urls and "url" not in errand
    body = json.dumps([{"url": urls[1], "data": "broken"}, {"url": urls[0], "data": b64(JPEG)}])
    assert link.deliver(errand["id"], 200, body, "")
    worker.join(2)
    assert got["photos"] == [Photo("image/jpeg", b64(JPEG), urls[0])] and link.pages == 0  # photos aren't pages

    def ask_and_fail(answer_body, error=None):
        result = {}
        thread = threading.Thread(target=lambda: result.update(photos=link.get_photos(urls)))
        thread.start()
        while "fetch" not in job.partial:
            time.sleep(0.01)
        link.deliver(job.partial["fetch"]["id"], 0, answer_body, "", error)
        thread.join(2)
        return result["photos"]

    assert ask_and_fail("", error="canvas tainted") == []
    assert ask_and_fail("{not json") == []
    assert ask_and_fail(json.dumps({"url": urls[0], "data": b64(JPEG)})) == []  # not a list
    assert ask_and_fail(json.dumps([{"url": ["x"], "data": b64(JPEG)}, "x"])) == []
    other = json.dumps([{"url": "https://img.kleinanzeigen.de/api/v1/other?rule=$_59.AUTO", "data": b64(JPEG)}])
    assert ask_and_fail(other) == []  # only the photos asked for


class RecordingClient:
    def __init__(self, parsed):
        self.requests, self.parsed = [], parsed
        self.beta = SimpleNamespace(messages=SimpleNamespace(parse=self._parse))

    def _parse(self, **request):
        self.requests.append(request)
        return SimpleNamespace(stop_reason="end_turn", parsed_output=self.parsed)


def test_the_photos_go_first_numbered_then_the_ad_text(monkeypatch):
    from helpers import make_analysis

    import cardeal.analyzer as analyzer_module
    monkeypatch.setattr(analyzer_module, "build_prompt", lambda *args: "THE AD TEXT")
    client = RecordingClient(make_analysis())
    analyzer = ListingAnalyzer(AISettings(model="claude-sonnet-5-5"), "de", client=client)
    photos = [Photo("image/jpeg", "AAA"), Photo("image/webp", "BBB")]
    analyzer.analyze(SimpleNamespace(url="https://x"), None, None, photos)
    content = client.requests[-1]["messages"][0]["content"]
    assert content == [
        {"type": "text", "text": "The ad's 2 photos, in order:"},
        {"type": "text", "text": "Photo 1:"},
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "AAA"}},
        {"type": "text", "text": "Photo 2:"},
        {"type": "image", "source": {"type": "base64", "media_type": "image/webp", "data": "BBB"}},
        {"type": "text", "text": "THE AD TEXT"},
    ]
    analyzer.analyze(SimpleNamespace(url="https://x"), None, None)
    assert client.requests[-1]["messages"][0]["content"] == "THE AD TEXT"  # without photos: as before
    assert "photo_findings" in client.requests[-1]["system"]
