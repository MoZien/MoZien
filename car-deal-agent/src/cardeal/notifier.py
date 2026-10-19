"""Formats deal reports and sends them to Telegram (or prints them)."""

from __future__ import annotations

import html
import logging
import re
from typing import Protocol

import requests

from cardeal.analyzer import costed_issues
from cardeal.i18n import euro, percent, t
from cardeal.models import DealReport

log = logging.getLogger(__name__)

TELEGRAM_LIMIT = 4096


class Notifier(Protocol):
    def send(self, report: DealReport) -> None: ...


MAX_ISSUES_SHOWN = 3
MAX_QUESTIONS_SHOWN = 2
RTL_LANGUAGES = {"ar"}


def format_report(report: DealReport, lang: str) -> str:
    """Short Telegram HTML message for one report, readable at a glance on a phone."""
    listing, valuation, flip, analysis = report.listing, report.valuation, report.flip, report.analysis
    e = html.escape
    rtl = lang in RTL_LANGUAGES

    def ltr(text: str) -> str:
        # In right-to-left messages, Unicode isolates keep numbers, units and German
        # words in one left-to-right piece; otherwise "(−18 %)" comes out as "18–) (%".
        return f"⁦{text}⁩" if rtl else text

    facts = [e(listing.location)] if listing.location else []
    if listing.km is not None:
        facts.append(f"{listing.km:,} km".replace(",", "."))
    if listing.year:
        facts.append(f"EZ {listing.month:02d}/{listing.year}" if listing.month else f"EZ {listing.year}")
    if listing.hu_until:
        hu_warning = f" ⚠️ +{euro(flip.hu_cost)}" if flip.hu_cost else ""
        facts.append(f"TÜV {e(listing.hu_until)}{hu_warning}")

    discount = valuation.discount(listing.price)
    market = f"{t(lang, 'market')} {ltr('~' + euro(valuation.market_price))}"
    if discount is not None:
        market += " " + ltr(f"({'−' if discount >= 0 else '+'}{percent(abs(discount))})")
    lines = [
        f"<b>{t(lang, f'verdict_{report.verdict}')} · {ltr(e(listing.title))}</b>",
        "📍 " + " · ".join(ltr(f) for f in facts),
        f"💶 <b>{ltr(euro(listing.price))}</b>" + (f" {t(lang, 'negotiable')}" if listing.negotiable else "")
        + f" {'←' if rtl else '→'} {market}",
        "📈 " + t(lang, "profit_line", profit=ltr("~" + euro(flip.profit)), resale=ltr("~" + euro(flip.resale_price)),
                  buy=ltr("~" + euro(flip.buy_price)), costs=ltr(euro(flip.total_costs))),
    ]
    if valuation.basis:
        count = t(lang, "comparables_link", n=valuation.comparables)
        if valuation.comparables_url:
            count = f'<a href="{e(valuation.comparables_url, quote=True)}">{count}</a>'
        unsure = " ⚠️" if valuation.confidence == "low" else ""
        lines.insert(3, f"📊 {count}: {ltr(e(valuation.basis))}{unsure}")
    if flip.max_buy_price > 0 and report.verdict != "skip":
        lines.append("💰 " + t(lang, "max_buy_line", price=ltr(euro(flip.max_buy_price)),
                               profit=ltr(euro(flip.target_profit))))

    other_reasons = report.reasons
    if analysis is not None:
        # The AI's reason is already the 🧠 line; don't repeat it among the reasons.
        other_reasons = [r for r in report.reasons if analysis.verdict_reason not in r]
        issues = costed_issues(analysis, listing)
        if issues:
            lines += [
                f"🔧 {e(i.issue)} {ltr('~' + euro(i.cost_eur))} – {ltr('“' + e(i.quote) + '”')}"
                for i in issues[:MAX_ISSUES_SHOWN]
            ]
        else:
            lines.append(f"🔧 {t(lang, 'no_issues')}")
        lines.append(f"🧠 {e(analysis.verdict_reason)}")
        if analysis.scam_risk != "low":
            signal = f": {e(analysis.scam_signals[0])}" if analysis.scam_signals else ""
            lines.append(f"🚩 {t(lang, 'scam_risk')} {t(lang, f'risk_{analysis.scam_risk}')}{signal}")
        if analysis.seller_message and report.verdict != "skip":
            # <pre> gets a copy button in Telegram.
            lines.append(f"✉️ {t(lang, 'seller_message')}\n<pre>{e(analysis.seller_message.strip())}</pre>")
        elif analysis.questions_for_seller:
            lines.append("❓ " + e(" · ".join(analysis.questions_for_seller[:MAX_QUESTIONS_SHOWN])))

    if other_reasons:
        lines.append("<i>" + e(" · ".join(other_reasons)) + "</i>")
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
        params = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
        links = re.findall(r'href="([^"]+)"', text)
        if links:
            # Preview the last link (the ad, with its photo), not the comparables search.
            params["link_preview_options"] = {"url": html.unescape(links[-1])}
        self.call("sendMessage", **params)

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
