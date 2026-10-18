"""Command line: `cardeal once`, `cardeal run`, `cardeal chat`, `cardeal analyze <url>`, `cardeal deals`."""

from __future__ import annotations

import argparse
import logging
import math
import random
import time
from pathlib import Path

import anthropic
import requests

from cardeal.analyzer import ListingAnalyzer
from cardeal.chatbot import ChatBot
from cardeal.config import AppConfig, load_config
from cardeal.i18n import euro, t
from cardeal.notifier import (
    ConsoleNotifier,
    TelegramClient,
    TelegramError,
    TelegramNotifier,
    format_report,
    to_plain_text,
)
from cardeal.pipeline import DealHunter
from cardeal.sources import KleinanzeigenSource
from cardeal.storage import Store

log = logging.getLogger("cardeal")


def _build_hunter(config: AppConfig, config_path: Path, use_ai: bool, notify: bool = True) -> DealHunter:
    database = Path(config.database)
    if not database.is_absolute():
        database = config_path.parent / database

    analyzer = None
    if use_ai and config.ai.enabled:
        try:
            client = anthropic.Anthropic()
        except anthropic.AnthropicError as exc:
            client = None
            log.warning("AI review disabled: %s", exc)
        # Without credentials the SDK only fails on the first request, so check up front.
        if client is not None and (client.api_key or client.auth_token or client.credentials):
            analyzer = ListingAnalyzer(config.ai, config.language, client=client)
        elif client is not None:
            log.warning("AI review disabled: ANTHROPIC_API_KEY is not set (see .env)")

    notifier = None
    if notify:
        if config.telegram_token and config.telegram_chat_id:
            notifier = TelegramNotifier(config.telegram_token, config.telegram_chat_id, config.language)
        else:
            log.info("TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set, printing deals to the console")
            notifier = ConsoleNotifier(config.language)
    return DealHunter(config, KleinanzeigenSource(config.scraper), Store(database), analyzer, notifier)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cardeal", description="Finds underpriced cars worth flipping.")
    parser.add_argument("-c", "--config", default="config.yaml", help="path to config.yaml")
    parser.add_argument("--no-ai", action="store_true", help="skip the Claude review (numbers only)")
    parser.add_argument("-v", "--verbose", action="store_true")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("once", help="run all searches one time")
    commands.add_parser("run", help="run all searches every interval_minutes and answer links sent in Telegram")
    commands.add_parser("chat", help="only answer links sent in Telegram, no searches")
    analyze = commands.add_parser("analyze", help="evaluate a single ad by URL")
    analyze.add_argument("url")
    deals = commands.add_parser("deals", help="show the latest deals found")
    deals.add_argument("-n", "--limit", type=int, default=10)
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    for noisy in ("httpx", "httpx2", "urllib3", "anthropic"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    config_path = Path(args.config)
    config = load_config(config_path)

    if args.command == "deals":
        hunter = _build_hunter(config, config_path, use_ai=False, notify=False)
        for report in hunter.store.recent_reports(args.limit):
            listing, flip = report["listing"], report["flip"]
            print(f"[{report['verdict']}] {euro(listing['price'])} → +{euro(flip['profit'])}  "
                  f"{listing['title']}\n    {listing['url']}")
        return 0

    if args.command == "analyze":
        hunter = _build_hunter(config, config_path, use_ai=not args.no_ai, notify=False)
        report, comps = hunter.analyze_url(args.url)
        if report is None:
            print(f"Only {comps} comparable ads found, not enough for a market price.")
            return 1
        print(to_plain_text(format_report(report, config.language)))
        return 0

    hunter = _build_hunter(config, config_path, use_ai=not args.no_ai)
    if args.command == "once":
        reports = hunter.run_once()
        log.info("done: %d evaluated, %d deals", len(reports), sum(r.verdict == "deal" for r in reports))
        return 0

    chat = None
    if config.telegram_token and config.telegram_chat_id:
        chat = ChatBot(
            TelegramClient(config.telegram_token), config.telegram_chat_id, hunter, config.language,
            allowed_chats=config.telegram_allowed_chats,
        )
    watch = args.command == "run" and config.watch_market
    if chat is not None:
        chat.reply(t(config.language, "chat_started" if watch else "chat_started_links"))
    elif not watch:
        print("Answering links needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.")
        return 1
    _serve(hunter, chat, config.interval_minutes if watch else None)
    return 0


def _poll_quietly(chat: ChatBot, timeout: int) -> bool:
    try:
        chat.poll(timeout=timeout)
        return True
    except (TelegramError, requests.RequestException) as exc:
        log.warning("Telegram: %s", exc)
        return False


def _serve(hunter: DealHunter, chat: ChatBot | None, interval_minutes: int | None) -> None:
    """Answers chat messages and, if `interval_minutes` is set, runs the searches on schedule.
    Single-threaded: during a search run the chat is checked before every ad."""
    next_run = time.monotonic() if interval_minutes else math.inf
    if chat is not None:
        hunter.between_ads = lambda: _poll_quietly(chat, timeout=0)
    while True:
        if chat is not None:
            if not _poll_quietly(chat, timeout=int(min(max(next_run - time.monotonic(), 0), 30))):
                time.sleep(10)
        else:
            time.sleep(max(next_run - time.monotonic(), 0))
        if time.monotonic() >= next_run:
            try:
                hunter.run_once()
            except Exception:  # keep the watcher alive; the next run starts fresh
                log.exception("run failed")
            pause = interval_minutes * 60 * random.uniform(0.85, 1.15)
            next_run = time.monotonic() + pause
            log.info("next run in %.0f minutes", pause / 60)


if __name__ == "__main__":
    raise SystemExit(main())
