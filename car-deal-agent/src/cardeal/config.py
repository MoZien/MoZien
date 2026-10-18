"""Loads config.yaml and .env into typed settings."""

from __future__ import annotations

import os
from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any

import yaml

from cardeal.models import SearchCriteria

DEFAULT_SPAM_KEYWORDS = ["ankauf", "wir kaufen", "kaufe dein", "suche", "gesuch", "tausche"]


@dataclass
class ValuationSettings:
    lookback_days: int = 60
    min_comparables: int = 5
    year_window: int = 2
    km_window: float = 0.4
    # Collect market data above the budget too, otherwise every car looks expensive.
    price_ceiling_factor: float = 1.6
    # Broad searches look up comparables per model and year; reuse them this long.
    comparables_refresh_hours: int = 24
    comparables_pages: int = 2


@dataclass
class DealSettings:
    min_discount: float = 0.12
    min_profit: int = 800
    min_roi: float = 0.12
    negotiation_discount: float = 0.05
    resale_factor: float = 0.95
    fixed_costs: dict[str, int] = field(
        default_factory=lambda: {"registration": 120, "transport": 100, "cleaning": 150}
    )
    hu_cost: int = 200
    hu_warning_months: int = 6
    # §25a UStG: dealers pay 19 % VAT on the margin. Off for private sellers.
    vat_margin_scheme: bool = False
    suspicious_discount: float = 0.40
    notify_on: list[str] = field(default_factory=lambda: ["deal", "check"])
    # False: the first run of a search only collects market data, alerts start
    # with ads posted after that. True: also evaluate the ads already online.
    alert_existing: bool = False


@dataclass
class AISettings:
    enabled: bool = True
    model: str = "claude-opus-5-5"
    effort: str = "medium"
    max_tokens: int = 16000


@dataclass
class ScraperSettings:
    min_delay_seconds: float = 4.0
    max_delay_seconds: float = 9.0
    timeout_seconds: float = 20.0
    # Broad searches open every new ad to read make and model; cap that per run.
    max_details_per_run: int = 30
    # "suche 3" in Telegram: evaluate at most this many new ads, from this many result pages.
    max_ads_per_hunt: int = 40
    hunt_pages: int = 4


@dataclass
class FilterSettings:
    exclude_keywords: list[str] = field(default_factory=lambda: list(DEFAULT_SPAM_KEYWORDS))


@dataclass
class AppConfig:
    searches: list[SearchCriteria]
    language: str = "ar"
    interval_minutes: int = 20
    # False: `cardeal run` only answers links sent in Telegram and never searches by itself.
    watch_market: bool = True
    database: str = "data/cardeal.sqlite3"
    valuation: ValuationSettings = field(default_factory=ValuationSettings)
    deal: DealSettings = field(default_factory=DealSettings)
    ai: AISettings = field(default_factory=AISettings)
    scraper: ScraperSettings = field(default_factory=ScraperSettings)
    filters: FilterSettings = field(default_factory=FilterSettings)
    telegram_token: str | None = None
    telegram_chat_id: str | None = None
    # Further people who may send links to the bot (alerts still go to telegram_chat_id only).
    telegram_allowed_chats: list[str] = field(default_factory=list)


def _build(cls: type, data: dict[str, Any] | None, section: str):
    data = data or {}
    known = {f.name for f in fields(cls)}
    unknown = set(data) - known
    if unknown:
        raise ValueError(f"Unknown key(s) in '{section}': {', '.join(sorted(unknown))}")
    return cls(**data)


def load_dotenv(path: Path) -> None:
    """Minimal .env reader; real environment variables win."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_config(path: str | Path) -> AppConfig:
    path = Path(path)
    load_dotenv(path.parent / ".env")
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}

    searches = [_build(SearchCriteria, s, "searches") for s in raw.pop("searches", [])]
    if not searches:
        raise ValueError("config needs at least one entry under 'searches'")

    sections = {
        "valuation": ValuationSettings,
        "deal": DealSettings,
        "ai": AISettings,
        "scraper": ScraperSettings,
        "filters": FilterSettings,
    }
    kwargs: dict[str, Any] = {
        name: _build(cls, raw.pop(name, None), name) for name, cls in sections.items()
    }
    config = _build(AppConfig, {**raw, **kwargs, "searches": searches}, "root")
    config.telegram_token = os.environ.get("TELEGRAM_BOT_TOKEN") or None
    config.telegram_chat_id = os.environ.get("TELEGRAM_CHAT_ID") or None
    config.telegram_allowed_chats = [
        chat.strip() for chat in os.environ.get("TELEGRAM_ALLOWED_CHATS", "").split(",") if chat.strip()
    ]
    return config
