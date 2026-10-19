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
        self.previews = []

    def get_updates(self, offset, timeout):
        self.offsets.append(offset)
        updates, self.updates = self.updates, []
        return updates

    def send_message(self, chat_id, text, preview=True):
        self.sent.append((chat_id, text))
        self.previews.append(preview)


class FakeHunter:
    def __init__(self, result=None, error=None):
        from cardeal.config import AppConfig
        from cardeal.models import SearchCriteria
        self.config = AppConfig(searches=[SearchCriteria(name="Alle Autos", max_price=3000)])
        self.result = result
        self.error = error
        self.urls = []

    def analyze_url(self, url):
        self.urls.append(url)
        if self.error:
            raise self.error
        return self.result


FRIEND = "555000111"


def message(update_id, text, chat_id=OWNER, first_name="Mohamad"):
    return {"update_id": update_id, "message": {
        "chat": {"id": int(chat_id)}, "from": {"id": int(chat_id), "first_name": first_name}, "text": text,
    }}


def report():
    listing = Listing(id="kleinanzeigen:3545110385", source="kleinanzeigen", url=AD, title="Opel Corsa D",
                      price=2200, year=2008, km=150_000, location="06108 Halle")
    return DealReport(listing, Valuation(3500, 15, 0.1, "high", "regression"),
                      FlipEstimate(2200, 3325, 0, 370, 0, 755, 0.29), "deal", search_name="Opel Corsa")


def bot(updates, hunter, allowed=()):
    telegram = FakeTelegram(updates)
    return ChatBot(telegram, OWNER, hunter, "de", allowed_chats=allowed), telegram


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


def test_strangers_are_turned_away_and_the_owner_learns_their_id():
    hunter = FakeHunter(result=(report(), 16))
    chat, telegram = bot([message(1, AD, chat_id=FRIEND, first_name="Ali <3"), message(2, AD, chat_id=FRIEND)],
                         hunter)
    chat.poll(timeout=0)

    assert hunter.urls == []  # no analysis, no API credit spent
    (to_stranger, private), (to_owner, note) = telegram.sent  # second message: no repeat
    assert (to_stranger, to_owner) == (FRIEND, OWNER)
    assert "privat" in private
    assert "Ali &lt;3" in note and f"<code>TELEGRAM_ALLOWED_CHATS={FRIEND}</code>" in note


def test_allowed_friend_gets_the_answer_in_their_own_chat():
    hunter = FakeHunter(result=(report(), 16))
    chat, telegram = bot([message(1, AD, chat_id=FRIEND)], hunter, allowed=[FRIEND])
    chat.poll(timeout=0)
    assert hunter.urls == [AD]
    assert [chat_id for chat_id, _ in telegram.sent] == [FRIEND, FRIEND]
    assert "Schnäppchen" in telegram.sent[1][1]


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


def test_hunt_count():
    from cardeal.chatbot import hunt_count
    assert hunt_count("suche 3") == 3
    assert hunt_count("/suche") == 3
    assert hunt_count("Such mir 5 Autos") == 5
    assert hunt_count("search 50") == 10  # capped
    assert hunt_count("دورلي ٢") == 2
    assert hunt_count("hallo") is None
    assert hunt_count("ich suche nichts") is None  # only commands at the start


class HuntingHunter:
    def __init__(self, finds, evaluated, error=None):
        from cardeal.config import AppConfig
        from cardeal.models import SearchCriteria
        self.config = AppConfig(searches=[SearchCriteria(name="Alle Autos", max_price=3000)])
        self.finds, self.evaluated, self.error = finds, evaluated, error
        self.calls = []

    def find_deals(self, count, max_ads, pages=4, on_found=None, should_stop=None):
        self.calls.append((count, max_ads, pages))
        found = []
        for r in self.finds:  # every "ad" is a find here
            if len(found) >= count or (should_stop is not None and should_stop()):
                break
            found.append(r)
            on_found(r)
        if self.error:
            raise self.error
        return found, self.evaluated

    def analyze_url(self, url):
        return report(), 16


def test_hunt_sends_each_find_and_a_summary_to_the_asker():
    hunter = HuntingHunter([report(), report()], evaluated=17)
    chat, telegram = bot([message(1, "suche 2", chat_id=FRIEND)], hunter, allowed=[FRIEND])
    chat.poll(timeout=0)
    assert hunter.calls == [(2, 40, 4)]
    texts = [text for chat_id, text in telegram.sent if chat_id == FRIEND]
    assert len(telegram.sent) == len(texts) == 4
    assert texts[0].startswith("🔎") and "2 lohnende Autos" in texts[0]
    assert "Schnäppchen" in texts[1] and "Schnäppchen" in texts[2]
    assert texts[3] == "✅ Fertig: 2 von 2 gefunden, 17 Anzeigen geprüft."


def test_hunt_without_finds_or_with_a_block_still_answers():
    chat, telegram = bot([message(1, "suche")], HuntingHunter([], evaluated=40))
    chat.poll(timeout=0)
    assert "Unter 40 neuen Anzeigen" in telegram.sent[-1][1]

    chat, telegram = bot([message(1, "suche 3")], HuntingHunter([report()], 5, error=SourceBlockedError("403")))
    chat.poll(timeout=0)
    texts = [text for _, text in telegram.sent]
    assert "Schnäppchen" in texts[1] and "blockt" in texts[2] and texts[3].startswith("✅ Fertig: 1 von 3")


class QueueTelegram(FakeTelegram):
    """Like Telegram: unconfirmed updates come back until a later call passes a higher offset.
    `arrivals[n]` are the updates that arrive before the n-th getUpdates call."""

    def __init__(self, arrivals):
        super().__init__()
        self.arrivals = arrivals
        self.inbox = []

    def get_updates(self, offset, timeout):
        self.inbox += self.arrivals.pop(0) if self.arrivals else []
        self.offsets.append(offset)
        return [u for u in self.inbox if offset is None or u["update_id"] >= offset]


def test_stop_ends_the_search_and_waiting_messages_are_answered_after():
    hunter = HuntingHunter([report(), report(), report()], evaluated=5)
    telegram = QueueTelegram([
        [message(1, "suche 3")],
        [],  # check before the 1st ad
        [message(2, "stop"), message(3, AD, chat_id=FRIEND)],  # arrive before the 2nd ad
    ])
    chat = ChatBot(telegram, OWNER, hunter, "de", allowed_chats=[FRIEND])
    chat.poll(timeout=0)

    to_owner = [text for chat_id, text in telegram.sent if chat_id == OWNER]
    to_friend = [text for chat_id, text in telegram.sent if chat_id == FRIEND]
    assert to_owner[0].startswith("🔎") and "stop" in to_owner[0]
    assert "Schnäppchen" in to_owner[1]  # the one find before the stop
    assert to_owner[2].startswith("⏹️ Okay")
    assert to_owner[3] == "⏹️ Suche gestoppt: 1 gefunden, 5 Anzeigen geprüft."
    assert len(to_owner) == 4
    assert to_friend[0].startswith("⏳") and "Schnäppchen" in to_friend[1]  # answered after the search


def test_messages_are_never_handled_twice():
    hunter = HuntingHunter([report()], evaluated=1)
    telegram = QueueTelegram([[message(1, "suche 1"), message(2, "hallo")]])
    chat = ChatBot(telegram, OWNER, hunter, "de")
    chat.poll(timeout=0)  # the search re-fetches "hallo" (not yet confirmed) and defers it
    chat.poll(timeout=0)
    helps = [text for _, text in telegram.sent if text.startswith("Schick mir")]
    assert len(helps) == 1
    assert telegram.offsets[-1] == 3


def test_stop_without_search_and_old_search_requests():
    chat, telegram = bot([message(1, "Stopp!")], FakeHunter())
    chat.poll(timeout=0)
    assert telegram.sent[-1][1] == "Gerade läuft keine Suche."

    hunter = HuntingHunter([report()], evaluated=1)
    telegram = FakeTelegram([{**message(1, "suche 3"), "message": {**message(1, "suche 3")["message"], "date": 1_000}}])
    chat = ChatBot(telegram, OWNER, hunter, "de", now=lambda: 1_000 + 11 * 60)
    chat.poll(timeout=0)
    assert hunter.calls == []  # sent 11 minutes ago, while the bot was off
    assert "als der Bot aus war" in telegram.sent[-1][1]


def test_details_after_a_report_show_the_calculation():
    hunter = FakeHunter(result=(report(), 16))
    chat, telegram = bot([message(1, AD), message(2, "Details?")], hunter)
    chat.poll(timeout=0)
    _, answer, details = (text for _, text in telegram.sent)
    assert answer.endswith("ℹ️ Schreib «details», dann zeige ich, wie jede Zahl zustande kommt")
    assert details.startswith("<b>🧮 Die Rechnung im Detail · Opel Corsa D</b>")
    assert "Gewinn 755 € = 3.325 € − 2.200 € − 370 €" in details
    assert telegram.previews == [True, True, False]  # no preview of some comparable for the details


def test_details_without_a_report_and_in_arabic():
    chat, telegram = bot([message(1, "تفاصيل")], FakeHunter())
    chat.poll(timeout=0)
    assert "ابعتلي رابط إعلان أول" not in telegram.sent[-1][1]  # German bot
    assert "Noch kein Bericht" in telegram.sent[-1][1]

    telegram = FakeTelegram([message(1, AD), message(2, "تفاصيل")])
    chat = ChatBot(telegram, OWNER, FakeHunter(result=(report(), 16)), "ar")
    chat.poll(timeout=0)
    assert "الحساب بالتفصيل" in telegram.sent[-1][1]


def test_ad_with_an_impossible_mileage_is_explained():
    from cardeal.pipeline import ImplausibleMileage
    chat, telegram = bot([message(1, AD)], FakeHunter(error=ImplausibleMileage(114)))
    chat.poll(timeout=0)
    assert "Kilometerstand in der Anzeige (114 km) kann nicht stimmen" in telegram.sent[-1][1]
