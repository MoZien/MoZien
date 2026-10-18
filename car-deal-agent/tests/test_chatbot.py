import requests

from cardeal.chatbot import ChatBot, find_ad_urls
from cardeal.models import DealReport, FlipEstimate, Listing, Valuation
from cardeal.sources.base import SourceBlockedError
from cardeal.sources.kleinanzeigen import listing_from_url

OWNER = "1341569257"
AD = "https://www.kleinanzeigen.de/s-anzeige/opel-corsa-d/3545110385-216-4256"


def test_find_ad_urls_in_shared_text():
    text = (
        "Schau dir diese Anzeige an: Opel Corsa D "
        f"{AD}?utm_source=sharesheet&utm_medium=social. Und die hier: "
        "kleinanzeigen.de/s-anzeige/3545110386, nochmal "
        f"{AD}?utm_source=sharesheet&utm_medium=social "
        "https://www.kleinanzeigen.de/s-autos/c216 https://example.com/s-anzeige/1"
    )
    assert find_ad_urls(text) == [
        f"{AD}?utm_source=sharesheet&utm_medium=social",
        "https://kleinanzeigen.de/s-anzeige/3545110386",
    ]
    assert find_ad_urls("hallo") == []


def test_listing_from_shared_urls():
    shared = listing_from_url(f"{AD}?utm_source=sharesheet")
    assert (shared.id, shared.url) == ("kleinanzeigen:3545110385", AD)
    assert listing_from_url("https://kleinanzeigen.de/s-anzeige/3545110386").id == "kleinanzeigen:3545110386"


class FakeTelegram:
    def __init__(self, updates=()):
        self.updates = list(updates)
        self.sent = []
        self.offsets = []

    def get_updates(self, offset, timeout):
        self.offsets.append(offset)
        updates, self.updates = self.updates, []
        return updates

    def send_message(self, chat_id, text):
        self.sent.append((chat_id, text))


class FakeHunter:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.urls = []

    def analyze_url(self, url):
        self.urls.append(url)
        if self.error:
            raise self.error
        return self.result


def message(update_id, text, chat_id=OWNER):
    return {"update_id": update_id, "message": {"chat": {"id": int(chat_id)}, "text": text}}


def report():
    listing = Listing(id="kleinanzeigen:3545110385", source="kleinanzeigen", url=AD, title="Opel Corsa D",
                      price=2200, year=2008, km=150_000, location="06108 Halle")
    return DealReport(listing, Valuation(3500, 15, 0.1, "high", "regression"),
                      FlipEstimate(2200, 3325, 0, 370, 0, 755, 0.29), "deal", search_name="Opel Corsa")


def bot(updates, hunter):
    telegram = FakeTelegram(updates)
    return ChatBot(telegram, OWNER, hunter, "de"), telegram


def test_link_gets_evaluated_and_answered():
    hunter = FakeHunter(result=(report(), 16))
    chat, telegram = bot([message(7, f"Was meinst du? {AD}")], hunter)

    chat.poll(timeout=0)

    assert hunter.urls == [AD]
    assert [chat_id for chat_id, _ in telegram.sent] == [OWNER, OWNER]
    assert telegram.sent[0][1].startswith("⏳")
    assert "Schnäppchen" in telegram.sent[1][1] and "3.500 €" in telegram.sent[1][1]
    chat.poll(timeout=0)
    assert telegram.offsets == [None, 8]  # confirms the handled update


def test_strangers_are_ignored():
    hunter = FakeHunter(result=(report(), 16))
    chat, telegram = bot([message(1, AD, chat_id="999")], hunter)
    chat.poll(timeout=0)
    assert hunter.urls == [] and telegram.sent == []


def test_text_without_link_gets_help():
    chat, telegram = bot([message(1, "Hallo")], FakeHunter())
    chat.poll(timeout=0)
    assert "Link" in telegram.sent[0][1]


def gone():
    response = requests.Response()
    response.status_code = 404
    return requests.HTTPError(response=response)


def test_problems_are_explained_not_crashing():
    cases = [
        (FakeHunter(result=(None, 3)), "Nur 3 Vergleichsautos"),
        (FakeHunter(error=ValueError("no make")), "Ist das eine Autoanzeige?"),
        (FakeHunter(error=SourceBlockedError("403")), "blockt"),
        (FakeHunter(error=gone()), "gibt es nicht mehr"),
        (FakeHunter(error=KeyError("boom")), "Fehler"),
    ]
    for hunter, expected in cases:
        chat, telegram = bot([message(1, AD)], hunter)
        chat.poll(timeout=0)
        assert expected in telegram.sent[-1][1]
