"""Formats deal reports and sends them to Telegram (or prints them)."""

from __future__ import annotations

import html
import logging
import re
import statistics
from typing import Protocol

import requests

from cardeal.analyzer import costed_issues
from cardeal.i18n import euro, percent, t
from cardeal.models import DealReport, Valuation
from cardeal.valuation import ad_flags

log = logging.getLogger(__name__)

TELEGRAM_LIMIT = 4096


class Notifier(Protocol):
    def send(self, report: DealReport) -> None: ...


MAX_ISSUES_SHOWN = 3
MAX_QUESTIONS_SHOWN = 2
MAX_COMPARABLES_SHOWN = 10
RTL_LANGUAGES = {"ar"}


def _ltr(lang: str):
    rtl = lang in RTL_LANGUAGES

    def ltr(text: str) -> str:
        # In right-to-left messages, Unicode isolates keep numbers, units and German
        # words in one left-to-right piece; otherwise "(−18 %)" comes out as "18–) (%".
        return f"⁦{text}⁩" if rtl else text

    return ltr


def _km(km: int) -> str:
    return f"{km:,} km".replace(",", ".")


def _registration(month: int | None, year: int) -> str:
    return f"{month:02d}/{year}" if month else str(year)


def _facts(report: DealReport) -> list[str]:
    """Place, mileage, first registration and TÜV, as German as the ad."""
    listing, flip = report.listing, report.flip
    facts = [html.escape(listing.location)] if listing.location else []
    if listing.km is not None:
        facts.append(_km(listing.km))
    if listing.year:
        facts.append(f"EZ {_registration(listing.month, listing.year)}")
    hu_warning = f" ⚠️ +{euro(flip.hu_cost)}" if flip.hu_cost else ""
    if listing.hu_until:
        facts.append(f"TÜV {html.escape(listing.hu_until)}{hu_warning}")
    elif "no_tuv" in ad_flags(listing):
        facts.append(f"ohne TÜV{hu_warning}")
    else:
        facts.append("TÜV ?")  # not in the ad: ask
    return facts


def _typical_range(valuation: Valuation) -> str | None:
    """Where the middle half of the (adjusted) comparable prices lies, e.g. '1.900–2.700 €',
    at the local price level like the market price."""
    prices = [c.adjusted * (valuation.local_factor or 1) for c in valuation.used]
    if len(prices) < 4:
        return None
    q1, _, q3 = statistics.quantiles(prices, n=4)
    return f"{euro(round(q1, -1))[:-2]}–{euro(round(q3, -1))}"


def _signed_percent(factor: float) -> str:
    """0.95 -> '−5 %', 1.03 -> '+3 %'."""
    return f"{'−' if factor < 1 else '+'}{percent(abs(factor - 1))}"


def format_report(report: DealReport, lang: str) -> str:
    """Short Telegram HTML message for one report, readable at a glance on a phone."""
    listing, valuation, flip, analysis = report.listing, report.valuation, report.flip, report.analysis
    e = html.escape
    rtl = lang in RTL_LANGUAGES
    ltr = _ltr(lang)

    discount = valuation.discount(listing.price) if flip.priced else None
    market = f"{t(lang, 'market')} {ltr('~' + euro(valuation.market_price))}"
    if discount is not None:
        market += " " + ltr(f"({'−' if discount >= 0 else '+'}{percent(abs(discount))})")
    if flip.priced:
        price = euro(listing.price)
    else:
        price = t(lang, "no_price") + (f" ({euro(listing.price)})" if listing.price is not None else "")

    resale = "~" + euro(flip.resale_price)
    if valuation.market_price and flip.resale_price != valuation.market_price:
        factor = flip.resale_factor or flip.resale_price / valuation.market_price
        resale += f" ({t(lang, 'resale_note', pct=percent(factor))})"
    if flip.priced:
        buy = "~" + euro(flip.buy_price)
        if listing.price and flip.buy_price < listing.price:
            buy += f" ({t(lang, 'buy_note', pct=percent(1 - flip.buy_price / listing.price))})"
        money = t(lang, "profit_line", profit=ltr("~" + euro(flip.profit)), resale=ltr(resale), buy=ltr(buy),
                  costs=ltr(euro(flip.total_costs)))
    else:
        money = t(lang, "offer_line", profit=ltr(euro(flip.target_profit)), max_buy=ltr(euro(flip.max_buy_price)),
                  resale=ltr(resale), costs=ltr(euro(flip.total_costs)))
    lines = [
        f"<b>{t(lang, f'verdict_{report.verdict}')} · {ltr(e(listing.title))}</b>",
        "📍 " + " · ".join(ltr(f) for f in _facts(report)),
        f"💶 <b>{ltr(price)}</b>" + (f" {t(lang, 'negotiable')}" if listing.negotiable else "")
        + f" {'←' if rtl else '→'} {market}",
        f"📈 {money}",
    ]
    if valuation.basis:
        count = t(lang, "comparables_link", n=valuation.comparables)
        if valuation.comparables_url:
            count = f'<a href="{e(valuation.comparables_url, quote=True)}">{count}</a>'
        notes = []
        if typical := _typical_range(valuation):
            notes.append(t(lang, "comparables_range", range=ltr(typical)))
        if valuation.local_factor:
            notes.append(t(lang, "local_note", pct=ltr(_signed_percent(valuation.local_factor))))
        if notes:
            count += f" ({' · '.join(notes)})"
        unsure = " ⚠️" if valuation.confidence == "low" else ""
        lines.insert(3, f"📊 {count}: {ltr(e(valuation.basis))}{unsure}")
    cost_parts = []
    if flip.fuel_cost:
        trip = f"{flip.trip_legs} × {flip.trip_km} km" if flip.trip_legs > 1 else f"{flip.trip_km} km"
        cost_parts.append(t(lang, "cost_fuel", cost=ltr("~" + euro(flip.fuel_cost)), km=ltr(trip)))
    if flip.hu_cost:
        cost_parts.append(t(lang, "cost_tuv", cost=ltr(euro(flip.hu_cost))))
    if flip.repair_costs:
        cost_parts.append(t(lang, "cost_repairs", cost=ltr(euro(flip.repair_costs))))
    fixed = flip.other_costs - flip.fuel_cost - flip.hu_cost
    if fixed:
        cost_parts.append(t(lang, "cost_other", cost=ltr(euro(fixed))))
    if flip.vat:
        cost_parts.append(t(lang, "cost_vat", cost=ltr(euro(flip.vat))))
    if cost_parts:
        lines.append(f"🧾 {t(lang, 'costs')}: " + " · ".join(cost_parts))

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


def _decimal(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def format_details(report: DealReport, lang: str, home_zip: str | None = None, radius_km: int = 0) -> str:
    """The calculation behind a report, to check every number: the comparable cars with their
    prices adjusted to this car, then resale, purchase, each cost and the profit."""
    listing, valuation, flip = report.listing, report.valuation, report.flip
    e = html.escape
    ltr = _ltr(lang)
    lines = [
        f"<b>{t(lang, 'details_title')} · {ltr(e(listing.title))}</b>",
        t(lang, "details_car", facts=" · ".join(ltr(f) for f in _facts(report))),
    ]
    market = ltr(euro(valuation.market_price))
    if valuation.used:
        median = round(statistics.median(c.adjusted for c in valuation.used), -1)
        lines.append(t(lang, "details_median", n=valuation.comparables, median=ltr(euro(median))))
        if valuation.year_effect is not None and valuation.km_effect is not None:
            lines.append(t(lang, "details_effects", year=ltr(f"+{percent(valuation.year_effect)}"),
                           km=ltr(f"−{percent(-valuation.km_effect)}")))
        for number, comp in enumerate(valuation.used[:MAX_COMPARABLES_SHOWN], 1):
            prices = euro(comp.price) if comp.adjusted == comp.price else f"{euro(comp.price)} → {euro(comp.adjusted)}"
            place = re.sub(r"^\s*\d{5}\s*", "", comp.location) or "?"
            lines.append(f"{number}. " + ltr(f"{prices} · {_km(comp.km)} · EZ {_registration(comp.month, comp.year)}")
                         + f' · <a href="{e(comp.url, quote=True)}">{e(place)}</a>')
        if len(valuation.used) > MAX_COMPARABLES_SHOWN:
            lines.append(t(lang, "details_more", n=len(valuation.used) - MAX_COMPARABLES_SHOWN))
        if valuation.local_factor:
            lines.append(t(lang, "details_local", market=market, median=ltr(euro(median)),
                           factor=ltr(_decimal(valuation.local_factor)), radius=radius_km or "?",
                           home=ltr(home_zip or "?"), pct=ltr(_signed_percent(valuation.local_factor)),
                           ads=valuation.local_ads))
        else:
            lines.append(t(lang, "details_market", market=market))
    else:
        lines.append(f"📊 {t(lang, 'market')} {market}")

    lines.append("")
    if valuation.market_price:
        factor = flip.resale_factor or flip.resale_price / valuation.market_price
        lines.append(t(lang, "details_resale", resale=ltr(euro(flip.resale_price)), pct=ltr(percent(factor))))
    if flip.priced:
        if flip.buy_price < listing.price:
            lines.append(t(lang, "details_buy_vb", buy=ltr(euro(flip.buy_price)), price=ltr(euro(listing.price)),
                           pct=ltr(percent(1 - flip.buy_price / listing.price))))
        else:
            lines.append(t(lang, "details_buy", buy=ltr(euro(flip.buy_price)), price=ltr(euro(listing.price))))
    costs = []
    if flip.fuel_cost:
        formula = (f"{flip.trip_legs} × {flip.trip_km} km × {_decimal(flip.consumption)} l/100 km"
                   f" × {_decimal(flip.fuel_price)} €/l")
        costs.append(t(lang, "details_fuel", cost=ltr(euro(flip.fuel_cost)), formula=ltr(formula)))
    if flip.hu_cost:
        costs.append(t(lang, "details_tuv", cost=ltr(euro(flip.hu_cost))))
    if flip.repair_costs and report.analysis is not None:
        items = " · ".join(f"{e(i.issue)} {ltr(euro(i.cost_eur))}" for i in costed_issues(report.analysis, listing))
        costs.append(t(lang, "details_repairs", cost=ltr(euro(flip.repair_costs)), items=items))
    if fixed := flip.other_costs - flip.fuel_cost - flip.hu_cost:
        costs.append(t(lang, "details_other", cost=ltr(euro(fixed))))
    if flip.vat:
        costs.append(t(lang, "cost_vat", cost=ltr(euro(flip.vat))))
    lines += [f"🧾 {cost}" for cost in costs] or [f"🧾 {t(lang, 'details_no_costs')}"]
    if flip.priced:
        lines.append(t(lang, "details_profit", profit=ltr(euro(flip.profit)), resale=ltr(euro(flip.resale_price)),
                       buy=ltr(euro(flip.buy_price)), costs=ltr(euro(flip.total_costs))))
    else:
        lines.append("📈 " + t(lang, "offer_line", profit=ltr(euro(flip.target_profit)),
                               max_buy=ltr(euro(flip.max_buy_price)), resale=ltr(euro(flip.resale_price)),
                               costs=ltr(euro(flip.total_costs))))

    # Too long for Telegram: show fewer comparables (whole lines, each closes its own tags).
    while len("\n".join(lines)) > TELEGRAM_LIMIT:
        numbered = [i for i, line in enumerate(lines) if re.match(r"\d+\. ", line)]
        if not numbered:
            break
        del lines[numbered[-1]]
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

    def send_message(self, chat_id: str, text: str, preview: bool = True) -> None:
        params = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
        links = re.findall(r'href="([^"]+)"', text)
        if not preview:
            params["link_preview_options"] = {"is_disabled": True}
        elif links:
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
