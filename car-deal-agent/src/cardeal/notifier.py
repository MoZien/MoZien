"""Formats deal reports and sends them to Telegram (or prints them)."""

from __future__ import annotations

import html
import logging
import re
from typing import Protocol

import requests

from cardeal.i18n import euro, percent, t
from cardeal.models import DealReport

log = logging.getLogger(__name__)

TELEGRAM_LIMIT = 4096


class Notifier(Protocol):
    def send(self, report: DealReport) -> None: ...


def format_report(report: DealReport, lang: str) -> str:
    """Telegram HTML message for one report."""
    listing, valuation, flip, analysis = report.listing, report.valuation, report.flip, report.analysis
    e = html.escape
    discount = valuation.discount(listing.price)

    facts = [listing.location]
    if listing.km is not None:
        facts.append(f"{listing.km:,} km".replace(",", "."))
    if listing.year:
        facts.append(f"EZ {listing.month:02d}/{listing.year}" if listing.month else f"EZ {listing.year}")
    if listing.power_ps:
        facts.append(f"{listing.power_ps} PS")
    if listing.seller_type:
        facts.append(t(lang, f"seller_{listing.seller_type}"))

    vat = t(lang, "vat", vat=euro(flip.vat)) if flip.vat else ""
    lines = [
        f"<b>{t(lang, f'verdict_{report.verdict}')}</b> · {e(report.search_name)}",
        f"🚗 <b>{e(listing.title)}</b>",
        "📍 " + e(" · ".join(f for f in facts if f)),
        f"💶 {t(lang, 'price')}: <b>{euro(listing.price)}</b>"
        + (f" ({t(lang, 'negotiable')})" if listing.negotiable else ""),
        f"📊 {t(lang, 'market')}: ~{euro(valuation.market_price)}"
        + (
            f" · {t(lang, 'below_market' if discount >= 0 else 'above_market')} {percent(abs(discount))}"
            if discount is not None else ""
        ),
        "    " + t(lang, "comparables", n=valuation.comparables,
                    confidence=t(lang, f"confidence_{valuation.confidence}")),
        f"📈 {t(lang, 'profit')}: <b>{euro(flip.profit)}</b> (ROI {percent(flip.roi)})",
        "    " + t(lang, "calc", buy=euro(flip.buy_price), repairs=euro(flip.repair_costs),
                    other=euro(flip.other_costs), vat=vat, resale=euro(flip.resale_price)),
    ]
    if listing.hu_until:
        lines.append(f"🛠 {t(lang, 'hu')}: {e(listing.hu_until)}")

    if analysis is not None:
        lines += ["", f"🧠 <b>{t(lang, 'ai')}</b>: {e(analysis.summary)}",
                  f"{t(lang, 'scam_risk')}: {t(lang, f'risk_{analysis.scam_risk}')}"]
        if analysis.red_flags:
            lines.append(f"⚠️ {t(lang, 'red_flags')}:")
            lines += [f"  • {e(f.issue)} (~{euro(f.estimated_cost_eur)})" for f in analysis.red_flags]
        if analysis.positives:
            lines.append(f"✅ {t(lang, 'positives')}: " + e(", ".join(analysis.positives)))
        if analysis.questions_for_seller:
            lines.append(f"❓ {t(lang, 'questions')}:")
            lines += [f"  • {e(q)}" for q in analysis.questions_for_seller]
        if analysis.negotiation_tip:
            lines.append(f"🤝 {t(lang, 'negotiation')}: {e(analysis.negotiation_tip)}")

    if report.reasons:
        lines += ["", f"<i>{t(lang, 'reasons')}: " + e(" · ".join(report.reasons)) + "</i>"]
    lines.append(f'🔗 <a href="{e(listing.url, quote=True)}">{e(listing.url)}</a>')

    # Too long for Telegram: drop whole lines (each closes its own tags) above the link.
    while len("\n".join(lines)) > TELEGRAM_LIMIT and len(lines) > 2:
        del lines[-2]
    return "\n".join(lines)


def to_plain_text(message: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", message))


class TelegramError(RuntimeError):
    pass


class TelegramClient:
    """The few Telegram Bot API calls the agent needs."""

    def __init__(self, token: str, session: requests.Session | None = None):
        self.base_url = f"https://api.telegram.org/bot{token}"
        self.session = session or requests.Session()

    def call(self, method: str, http_timeout: float = 20, **params):
        response = self.session.post(f"{self.base_url}/{method}", json=params, timeout=http_timeout)
        try:
            data = response.json()
        except ValueError:
            data = {}
        if not data.get("ok"):
            raise TelegramError(f"{method}: {response.status_code} {data.get('description') or response.text[:200]}")
        return data["result"]

    def send_message(self, chat_id: str, text: str) -> None:
        # Link previews are on, so the ad photo shows up under the message.
        self.call("sendMessage", chat_id=chat_id, text=text, parse_mode="HTML", disable_web_page_preview=False)

    def get_updates(self, offset: int | None, timeout: int) -> list[dict]:
        """Long polling: waits up to `timeout` seconds for new messages."""
        return self.call(
            "getUpdates", http_timeout=timeout + 15, offset=offset, timeout=timeout, allowed_updates=["message"]
        )


class TelegramNotifier:
    def __init__(self, token: str, chat_id: str, lang: str, session: requests.Session | None = None):
        self.client = TelegramClient(token, session)
        self.chat_id = chat_id
        self.lang = lang

    def send(self, report: DealReport) -> None:
        try:
            self.client.send_message(self.chat_id, format_report(report, self.lang))
        except (TelegramError, requests.RequestException) as exc:
            log.error("Telegram rejected the message: %s", exc)


class ConsoleNotifier:
    def __init__(self, lang: str):
        self.lang = lang

    def send(self, report: DealReport) -> None:
        print(to_plain_text(format_report(report, self.lang)), end="\n\n" + "-" * 60 + "\n\n")
