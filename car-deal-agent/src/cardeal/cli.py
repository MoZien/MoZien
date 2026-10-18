"""Command line: `cardeal once`, `cardeal run`, `cardeal analyze <url>`, `cardeal deals`."""

from __future__ import annotations

import argparse
import logging
import random
import time
from pathlib import Path

import anthropic

from cardeal.analyzer import ListingAnalyzer
from cardeal.config import AppConfig, load_config
from cardeal.i18n import euro
from cardeal.notifier import ConsoleNotifier, TelegramNotifier, format_report, to_plain_text
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
            analyzer = ListingAnalyzer(config.ai, config.language)
        except anthropic.AnthropicError as exc:
            log.warning("AI review disabled, no Claude credentials (%s)", exc)

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
    commands.add_parser("run", help="run all searches every interval_minutes")
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

    while True:
        try:
            hunter.run_once()
        except Exception:  # keep the watcher alive; the next run starts fresh
            log.exception("run failed")
        pause = config.interval_minutes * 60 * random.uniform(0.85, 1.15)
        log.info("next run in %.0f minutes", pause / 60)
        time.sleep(pause)


if __name__ == "__main__":
    raise SystemExit(main())
