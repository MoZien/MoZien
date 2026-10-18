"""Telegram chat: send the bot a Kleinanzeigen link and get the evaluation back."""

from __future__ import annotations

import html
import logging
import re
import time
from collections.abc import Callable

import requests

from cardeal.i18n import t
from cardeal.notifier import TelegramClient, TelegramError, format_report
from cardeal.pipeline import DealHunter
from cardeal.sources.base import SourceBlockedError

log = logging.getLogger(__name__)

AD_URL_RE = re.compile(r"(?:https?://)?(?:[\w-]+\.)?kleinanzeigen\.de/s-anzeige/[^\s<>\"']+", re.IGNORECASE)
MAX_LINKS_PER_MESSAGE = 3
# "suche 3", "/suche", "search 5", "دورلي 3", "ابحث ٣" (\d also matches Arabic-Indic digits)
HUNT_RE = re.compile(r"^\s*/?(such|search|find|ابحث|دور|لاقي|فتش)", re.IGNORECASE)
DEFAULT_HUNT_COUNT = 3
MAX_HUNT_COUNT = 10
SECONDS_PER_AD = 20  # detail page + comparables at polite speed, for the time estimate
STOP_WORDS = {"stop", "stopp", "/stop", "halt", "abbrechen", "cancel", "توقف", "وقف", "خلص", "بس", "كفى"}
# A search request older than this was sent while the bot was off; don't start it unasked.
MAX_HUNT_REQUEST_AGE = 10 * 60


def is_stop(text: str) -> bool:
    return (text or "").strip().lower().rstrip("!.") in STOP_WORDS


def hunt_count(text: str) -> int | None:
    """Number of cars asked for in a search command, None if the text is no search command."""
    if not HUNT_RE.match(text or ""):
        return None
    number = re.search(r"\d+", text)
    return min(max(int(number.group()), 1), MAX_HUNT_COUNT) if number else DEFAULT_HUNT_COUNT


def find_ad_urls(text: str) -> list[str]:
    """Ad links in a message, e.g. the text the Kleinanzeigen app shares."""
    urls: list[str] = []
    for match in AD_URL_RE.findall(text or ""):
        url = match.rstrip(".,;:!?)]}")
        if not url.lower().startswith("http"):
            url = "https://" + url
        if url not in urls:
            urls.append(url)
    return urls


class ChatBot:
    """Answers ad links from the owner (`chat_id`) and from `allowed_chats`.
    Everyone else is turned away, so nobody can spend the owner's API credit."""

    def __init__(
        self,
        client: TelegramClient,
        chat_id: str,
        hunter: DealHunter,
        lang: str,
        allowed_chats: tuple[str, ...] | list[str] = (),
        now: Callable[[], float] = time.time,
    ):
        self.client = client
        self.chat_id = str(chat_id)
        self.allowed = {self.chat_id, *(str(c) for c in allowed_chats)}
        self.hunter = hunter
        self.lang = lang
        self.offset: int | None = None
        self._turned_away: set[str] = set()
        self._now = now
        # While a search runs, the chat is checked between ads: "stop" ends it,
        # everything else waits in _deferred until the search is over.
        self._hunt_chat: str | None = None
        self._stop_requested = False
        self._deferred: list[tuple[str, str, int | None]] = []

    def poll(self, timeout: int = 30) -> None:
        """Waits up to `timeout` seconds for messages and answers them."""
        for update in self.client.get_updates(self.offset, timeout):
            if self.offset is not None and update["update_id"] < self.offset:
                continue  # already handled by a check made during a search
            self.offset = update["update_id"] + 1
            message = update.get("message") or {}
            chat_id = str(message.get("chat", {}).get("id", ""))
            if not chat_id:
                continue
            if chat_id not in self.allowed:
                self._turn_away(chat_id, message)
                continue
            text = message.get("text") or message.get("caption") or ""
            if self._hunt_chat is not None:
                if chat_id == self._hunt_chat and is_stop(text):
                    self._stop_requested = True
                    self.reply(t(self.lang, "hunt_stopping"), chat_id)
                else:
                    self._deferred.append((text, chat_id, message.get("date")))
                continue
            self.handle(text, chat_id, sent_at=message.get("date"))

    def handle(self, text: str, chat_id: str | None = None, sent_at: int | None = None) -> None:
        chat_id = chat_id or self.chat_id
        if is_stop(text):
            self.reply(t(self.lang, "hunt_not_running"), chat_id)
            return
        urls = find_ad_urls(text)
        if not urls and (count := hunt_count(text)) is not None:
            if sent_at is not None and self._now() - sent_at > MAX_HUNT_REQUEST_AGE:
                self.reply(t(self.lang, "hunt_too_old"), chat_id)
                return
            self._hunt(count, chat_id)
            return
        if not urls:
            self.reply(t(self.lang, "chat_help"), chat_id)
            return
        for url in urls[:MAX_LINKS_PER_MESSAGE]:
            self.reply(t(self.lang, "chat_working"), chat_id)
            self.reply(self._evaluate(url), chat_id)

    def _hunt(self, count: int, chat_id: str) -> None:
        """Searches the newest ads until `count` worthwhile cars are found, sending each right away."""
        if not self.hunter.config.searches:
            self.reply(t(self.lang, "hunt_no_search"), chat_id)
            return
        max_ads = self.hunter.config.scraper.max_ads_per_hunt
        minutes = max(1, round(max_ads * SECONDS_PER_AD / 60))
        self.reply(t(self.lang, "hunt_start", count=count, max=max_ads, minutes=minutes), chat_id)
        found = []
        evaluated = 0

        def send(report) -> None:
            found.append(report)
            self.reply(format_report(report, self.lang), chat_id)

        def should_stop() -> bool:
            try:
                self.poll(timeout=0)
            except (TelegramError, requests.RequestException) as exc:
                log.warning("Telegram: %s", exc)
            return self._stop_requested

        self._hunt_chat, self._stop_requested = chat_id, False
        try:
            _, evaluated = self.hunter.find_deals(
                count, max_ads, pages=self.hunter.config.scraper.hunt_pages, on_found=send, should_stop=should_stop
            )
        except SourceBlockedError:
            self.reply(t(self.lang, "chat_blocked"), chat_id)
        except Exception as exc:  # report what was found so far instead of going silent
            log.exception("search in chat failed")
            self.reply(t(self.lang, "chat_error", error=html.escape(f"{type(exc).__name__}: {exc}"[:200])), chat_id)
        finally:
            self._hunt_chat = None
        if self._stop_requested:
            key = "hunt_stopped"
        else:
            key = "hunt_done" if found else "hunt_none"
        self.reply(t(self.lang, key, found=len(found), count=count, checked=evaluated), chat_id)

        deferred, self._deferred = self._deferred, []
        for text, sender, sent_at in deferred:
            self.handle(text, sender, sent_at)

    def _turn_away(self, chat_id: str, message: dict) -> None:
        """Tells a stranger once that the bot is private, and tells the owner how to let them in."""
        log.info("message from chat %s ignored (not in TELEGRAM_ALLOWED_CHATS)", chat_id)
        if chat_id in self._turned_away:
            return
        self._turned_away.add(chat_id)
        sender = message.get("from") or message.get("chat") or {}
        name = " ".join(filter(None, [sender.get("first_name"), sender.get("last_name")])) or "?"
        if sender.get("username"):
            name += f" (@{sender['username']})"
        self.reply(t(self.lang, "chat_private"), chat_id)
        self.reply(t(self.lang, "chat_stranger", name=html.escape(name), id=chat_id))

    def _evaluate(self, url: str) -> str:
        try:
            report, comparables = self.hunter.analyze_url(url)
        except ValueError:
            return t(self.lang, "chat_not_car")
        except SourceBlockedError:
            return t(self.lang, "chat_blocked")
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code in (404, 410):
                return t(self.lang, "chat_gone")
            return t(self.lang, "chat_error", error=html.escape(str(exc)[:200]))
        except Exception as exc:  # one broken ad must not stop the bot
            log.exception("analysis failed for %s", url)
            return t(self.lang, "chat_error", error=html.escape(f"{type(exc).__name__}: {exc}"[:200]))
        if report is None:
            return t(self.lang, "chat_few_comps", n=comparables)
        return format_report(report, self.lang)

    def reply(self, text: str, chat_id: str | None = None) -> None:
        try:
            self.client.send_message(chat_id or self.chat_id, text)
        except (TelegramError, requests.RequestException) as exc:
            log.error("could not answer in Telegram: %s", exc)
