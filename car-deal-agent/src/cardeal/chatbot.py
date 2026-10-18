"""Telegram chat: send the bot a Kleinanzeigen link and get the evaluation back."""

from __future__ import annotations

import html
import logging
import re

import requests

from cardeal.i18n import t
from cardeal.notifier import TelegramClient, TelegramError, format_report
from cardeal.pipeline import DealHunter
from cardeal.sources.base import SourceBlockedError

log = logging.getLogger(__name__)

AD_URL_RE = re.compile(r"(?:https?://)?(?:[\w-]+\.)?kleinanzeigen\.de/s-anzeige/[^\s<>\"']+", re.IGNORECASE)
MAX_LINKS_PER_MESSAGE = 3


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
    ):
        self.client = client
        self.chat_id = str(chat_id)
        self.allowed = {self.chat_id, *(str(c) for c in allowed_chats)}
        self.hunter = hunter
        self.lang = lang
        self.offset: int | None = None
        self._turned_away: set[str] = set()

    def poll(self, timeout: int = 30) -> None:
        """Waits up to `timeout` seconds for messages and answers them."""
        for update in self.client.get_updates(self.offset, timeout):
            self.offset = update["update_id"] + 1
            message = update.get("message") or {}
            chat_id = str(message.get("chat", {}).get("id", ""))
            if not chat_id:
                continue
            if chat_id not in self.allowed:
                self._turn_away(chat_id, message)
                continue
            self.handle(message.get("text") or message.get("caption") or "", chat_id)

    def handle(self, text: str, chat_id: str | None = None) -> None:
        chat_id = chat_id or self.chat_id
        urls = find_ad_urls(text)
        if not urls:
            self.reply(t(self.lang, "chat_help"), chat_id)
            return
        for url in urls[:MAX_LINKS_PER_MESSAGE]:
            self.reply(t(self.lang, "chat_working"), chat_id)
            self.reply(self._evaluate(url), chat_id)

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
