"""One hunting pass: search → store market data → value → filter → details → AI → decide → notify.

The cheap checks (price vs. market, profit before repairs) run first, so the
detail page and the AI review are only paid for on real candidates.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from dataclasses import replace
from datetime import datetime, timedelta

import anthropic
import requests

from cardeal.analyzer import AnalysisError, ListingAnalyzer, repair_costs
from cardeal.config import AppConfig
from cardeal.flip import decide, estimate_flip
from cardeal.models import DealReport, Listing, SearchCriteria, Valuation
from cardeal.notifier import Notifier
from cardeal.sources.base import ListingSource, SourceBlockedError
from cardeal.sources.kleinanzeigen import build_search_url, listing_from_url, make_slug
from cardeal.storage import Store
from cardeal.valuation import estimate_market_price

log = logging.getLogger(__name__)

UNKNOWN_MODELS = {"andere", "weitere", "sonstige", "sonstige_autos"}
MAKE_WORDS = {
    "vw", "volkswagen", "mercedes", "benz", "mercedes-benz", "mb", "bmw", "opel", "ford", "audi", "seat", "skoda",
    "škoda", "fiat", "renault", "peugeot", "citroen", "citroën", "toyota", "nissan", "mazda", "honda", "hyundai",
    "kia", "dacia", "volvo", "mini", "smart", "suzuki", "mitsubishi", "chevrolet", "alfa", "romeo",
}
# Title words that never name a model.
GENERIC_WORDS = {"auto", "pkw", "verkaufe", "verkauf", "top", "neu", "tüv", "tuev", "hu", "gepflegt", "zustand"}


def model_name(listing: Listing) -> str:
    """The model as people call it: "Golf" from "Weitere Golf", or for models Kleinanzeigen
    files under "Andere" the first word of the title that isn't the make ("VW Scirocco 1.4" → "Scirocco")."""
    if (listing.make or "").lower() in UNKNOWN_MODELS or (listing.make_slug or "") in UNKNOWN_MODELS:
        return ""  # unknown brand: nothing reliable to compare with
    shown = re.sub(r"^(Weitere|Andere)\s+", "", listing.model or "", flags=re.IGNORECASE).strip()
    make_words = MAKE_WORDS | {w.lower() for w in re.split(r"[\s-]+", listing.make or "") if w}
    if shown and shown.lower() not in UNKNOWN_MODELS | make_words:
        return shown
    for word in re.findall(r"[A-Za-zÄÖÜäöüß][\w-]*", listing.title or ""):
        if word.lower() not in make_words | GENERIC_WORDS and len(word) >= 2:
            return word
    return ""


class DealHunter:
    def __init__(
        self,
        config: AppConfig,
        source: ListingSource,
        store: Store,
        analyzer: ListingAnalyzer | None = None,
        notifier: Notifier | None = None,
        clock: Callable[[], datetime] = datetime.now,
    ):
        self.config = config
        self.source = source
        self.store = store
        self.analyzer = analyzer
        self.notifier = notifier
        self.clock = clock
        # Called before each ad a search evaluates; `cardeal run` answers the chat
        # there, so a link sent mid-run doesn't wait minutes for the run to end.
        self.between_ads: Callable[[], None] | None = None
        keywords = config.filters.exclude_keywords
        self._excluded = (
            re.compile(r"\b(" + "|".join(re.escape(k) for k in keywords) + r")\b", re.IGNORECASE)
            if keywords else None
        )

    def run_once(self) -> list[DealReport]:
        reports: list[DealReport] = []
        for search in self.config.searches:
            try:
                reports += self._run_search(search)
            except SourceBlockedError as exc:
                log.warning("%s: blocked (%s), retrying next run", search.name, exc)
            except requests.RequestException as exc:
                log.warning("%s: network error (%s), retrying next run", search.name, exc)
        return reports

    def _market_search(self, search: SearchCriteria) -> SearchCriteria:
        """The user's search widened by the comparison window. Without this, a car at
        the edge of the filters (e.g. 169,000 km with max_km 170,000) is only compared
        with cars on one side of it."""
        v = self.config.valuation
        return replace(
            search,
            min_year=search.min_year - v.year_window if search.min_year else None,
            max_year=search.max_year + v.year_window if search.max_year else None,
            min_km=round(search.min_km * (1 - v.km_window)) if search.min_km else None,
            max_km=round(search.max_km * (1 + v.km_window)) if search.max_km else None,
        )

    def _fetch(self, search: SearchCriteria, now: datetime, pages: int | None = None) -> list[Listing]:
        """Newest ads for a search, stored as market data."""
        if pages is not None:
            search = replace(search, pages=pages)
        if search.is_broad:
            # Results of a broad search are no market data (mixed models), so fetch
            # exactly what the user asked for and look up comparables per ad.
            listings = self.source.search(search)
        else:
            ceiling = round(search.max_price * self.config.valuation.price_ceiling_factor) if search.max_price else None
            listings = self.source.search(self._market_search(search), price_ceiling=ceiling)
        for listing in listings:
            self.store.upsert(listing, search.segment, now)
        return listings

    def _evaluate_candidate(self, listing: Listing, search: SearchCriteria, comps: list[Listing]) -> DealReport | None:
        if search.is_broad:
            listing = self.source.fetch_details(listing)
            comps = []
        return self.evaluate(listing, comps, search.name)

    def find_deals(
        self,
        count: int,
        max_ads: int,
        pages: int = 4,
        on_found: Callable[[DealReport], None] | None = None,
        should_stop: Callable[[], bool] | None = None,
    ) -> tuple[list[DealReport], int]:
        """Goes through the newest not yet evaluated ads of all searches until `count`
        worthwhile cars (deal or check) are found, `max_ads` ads were evaluated or
        `should_stop` (asked before each ad) returns True.
        Returns the finds and the number of ads evaluated."""
        found: list[DealReport] = []
        evaluated = 0
        now = self.clock()
        for search in self.config.searches:
            listings = self._fetch(search, now, pages)
            comps = [] if search.is_broad else self.store.comparables(
                search.segment, now - timedelta(days=self.config.valuation.lookback_days)
            )
            for listing in listings:
                if len(found) >= count or evaluated >= max_ads:
                    return found, evaluated
                if not self._is_candidate(listing, search) or not self.store.needs_evaluation(listing):
                    continue
                if should_stop is not None and should_stop():
                    return found, evaluated
                evaluated += 1
                report = self._evaluate_candidate(listing, search, comps)
                self.store.mark_evaluated(listing)
                if report is None:
                    continue
                self.store.save_report(report, now)
                if report.verdict in ("deal", "check"):
                    found.append(report)
                    if on_found is not None:
                        on_found(report)
        return found, evaluated

    def _run_search(self, search: SearchCriteria) -> list[DealReport]:
        now = self.clock()
        first_run = not self.store.has_segment(search.segment)
        listings = self._fetch(search, now)
        if first_run and not self.config.deal.alert_existing:
            # Ads already online are market data; alerts are for what gets posted next.
            for listing in listings:
                self.store.mark_evaluated(listing)
            log.info("%s: first run, stored %d ads as market data; alerts start with new ads",
                     search.name, len(listings))
            return []
        comps = [] if search.is_broad else self.store.comparables(
            search.segment, now - timedelta(days=self.config.valuation.lookback_days)
        )

        reports = []
        details_left = self.config.scraper.max_details_per_run
        for listing in listings:
            if not self._is_candidate(listing, search) or not self.store.needs_evaluation(listing):
                continue
            if self.between_ads is not None:
                self.between_ads()
            if search.is_broad:
                if details_left == 0:
                    log.info("%s: detail limit reached, the rest waits for the next run", search.name)
                    break
                details_left -= 1
            report = self._evaluate_candidate(listing, search, comps)
            self.store.mark_evaluated(listing)
            if report is None:
                continue
            self.store.save_report(report, now)
            reports.append(report)
            if self.notifier and report.verdict in self.config.deal.notify_on:
                self.notifier.send(report)
        log.info("%s: %d listings, %d reports", search.name, len(listings), len(reports))
        return reports

    def _comparable_searches(self, listing: Listing) -> list[SearchCriteria]:
        """Searches for the same kind of car, from exact to loose: same model, fuel, gearbox,
        body and power first; each later step drops a filter in case too few cars match."""
        v = self.config.valuation
        if listing.year is None:
            return []
        common = dict(
            min_year=listing.year - v.year_window, max_year=listing.year + v.year_window,
            seller=v.comparables_seller, damaged=False, pages=v.comparables_pages,
        )
        if listing.make_slug and listing.model_slug and listing.model_slug not in UNKNOWN_MODELS:
            base = SearchCriteria(name="", make=listing.make_slug, model=listing.model_slug, **common)
        else:
            # Model missing from Kleinanzeigen's list (filed under "Andere", e.g. a Scirocco) or
            # no filter values on the page: search by the model's name, within "Andere" if so filed.
            name = model_name(listing)
            if not listing.make or not name:
                return []
            base = SearchCriteria(
                name="", make=listing.make_slug or make_slug(listing.make),
                model=listing.model_slug if listing.model_slug in UNKNOWN_MODELS else None,
                query=name.lower(), **common,
            )

        def power_band(tolerance: float) -> dict:
            if not listing.power_ps:
                return {}
            return dict(min_power=round(listing.power_ps * (1 - tolerance)),
                        max_power=round(listing.power_ps * (1 + tolerance)))

        searches = []
        if listing.fuel_slug and listing.gearbox_slug:
            same_drive = replace(base, fuel=listing.fuel_slug, gearbox=listing.gearbox_slug)
            searches.append(replace(same_drive, body_type=listing.body_slug, **power_band(0.15)))
            searches.append(replace(same_drive, **power_band(0.25)))
        if listing.fuel_slug:
            searches.append(replace(base, fuel=listing.fuel_slug))
        searches.append(base)
        unique = {build_search_url(c): c for c in reversed(searches)}  # keep the first of duplicates
        return [c for c in searches if unique.get(build_search_url(c)) is c]

    @staticmethod
    def _describe(criteria: SearchCriteria, listing: Listing) -> str:
        parts = [model_name(listing) or criteria.model or criteria.query]
        if criteria.fuel:
            parts.append(listing.fuel or criteria.fuel)
        if criteria.gearbox:
            parts.append(listing.gearbox or criteria.gearbox)
        if criteria.body_type:
            parts.append(listing.body_type or criteria.body_type)
        if criteria.min_power and criteria.max_power:
            parts.append(f"{criteria.min_power}–{criteria.max_power} PS")
        parts.append(f"{criteria.min_year}–{criteria.max_year}")
        return " · ".join(str(p) for p in parts if p)

    def _exact_valuation(self, listing: Listing) -> Valuation:
        """Market price from cars as similar as possible to this one (needs the ad page loaded).
        Comparables per search are fetched at most once per `comparables_refresh_hours`."""
        v = self.config.valuation
        now = self.clock()
        searches = self._comparable_searches(listing)
        if not searches:
            log.info("unknown make/model, can't value: %s", listing.url)
            return Valuation(None, 0, None, "none", "unknown make or model")
        self.store.upsert(listing, f"{searches[0].make}:{searches[0].model or searches[0].query}", now)

        best = Valuation(None, 0, None, "none", "not enough comparables")
        for criteria in searches:
            url = build_search_url(criteria)
            fetched_at = self.store.comparables_fetched_at(url)
            if fetched_at is None or now - fetched_at > timedelta(hours=v.comparables_refresh_hours):
                found = self.source.search(criteria)
                segment = f"{criteria.make}:{criteria.model or criteria.query}"
                for comp in found:
                    self.store.upsert(comp, segment, now)
                self.store.add_to_set(url, [comp.id for comp in found])
                self.store.mark_comparables_fetched(url, now)
            comps = self.store.comparable_set(url, now - timedelta(days=v.lookback_days))
            valuation = estimate_market_price(listing, comps, v)
            valuation.basis = self._describe(criteria, listing)
            valuation.comparables_url = url
            if valuation.market_price is not None:
                return valuation
            if valuation.comparables >= best.comparables:
                best = valuation
        return best

    def _worth_a_closer_look(self, listing: Listing, valuation: Valuation) -> bool:
        """Cheap checks before spending requests and AI credit: far enough below market and
        profitable before repairs (repairs only lower the profit)."""
        settings = self.config.deal
        discount = valuation.discount(listing.price) or 0.0
        if discount < settings.min_discount:
            return False
        flip = estimate_flip(listing, valuation, settings, today=self.clock().date())
        return flip.profit >= settings.min_profit

    def _is_candidate(self, listing: Listing, search: SearchCriteria) -> bool:
        def within(value: int | None, low: int | None, high: int | None) -> bool:
            if value is None:
                return low is None and high is None
            return (low is None or value >= low) and (high is None or value <= high)

        return (
            listing.price is not None
            and within(listing.price, search.min_price, search.max_price)
            and within(listing.year, search.min_year, search.max_year)
            and within(listing.km, search.min_km, search.max_km)
            and not (self._excluded and self._excluded.search(listing.title))
        )

    def evaluate(
        self,
        listing: Listing,
        comps: list[Listing],
        search_name: str = "",
        force: bool = False,
        valuation: Valuation | None = None,
    ) -> DealReport | None:
        """Full evaluation of one listing. Returns None when it is clearly no deal
        (unless `force`) or when there is not enough market data.

        `comps` (the search's own results) give a rough first look before the ad is
        opened; the price that counts comes from exact comparables afterwards."""
        settings = self.config.deal
        today = self.clock().date()

        if valuation is None and comps and not listing.details_loaded and not force:
            rough = estimate_market_price(listing, comps, self.config.valuation)
            if rough.market_price is None or not self._worth_a_closer_look(listing, rough):
                return None
        if not listing.details_loaded:
            listing = self.source.fetch_details(listing)
        if valuation is None:
            valuation = self._exact_valuation(listing)
            if valuation.market_price is None and comps:
                valuation = estimate_market_price(listing, comps, self.config.valuation)
        if valuation.market_price is None:
            return None
        if not force and not self._worth_a_closer_look(listing, valuation):
            return None

        flip = estimate_flip(listing, valuation, settings, today=today)
        analysis = None
        if self.analyzer is not None:
            try:
                analysis = self.analyzer.analyze(listing, valuation, flip)
                flip = estimate_flip(
                    listing, valuation, settings, repair_costs=repair_costs(analysis, listing), today=today
                )
            except (AnalysisError, anthropic.APIError) as exc:
                log.warning("AI analysis failed for %s: %s", listing.url, exc)

        verdict, reasons = decide(listing, valuation, flip, settings, analysis, today, self.config.language)
        if verdict == "deal" and analysis is None and self.analyzer is not None:
            verdict = "check"  # the AI was supposed to look at it but could not
        return DealReport(listing, valuation, flip, verdict, reasons, analysis, search_name)

    def analyze_url(self, url: str) -> tuple[DealReport | None, int]:
        """Evaluates one ad by URL, collecting fresh comparables for it first.
        Returns the report (None if the market price can't be estimated) and the number of comparables."""
        listing = self.source.fetch_details(listing_from_url(url))
        if not self._comparable_searches(listing):
            raise ValueError("could not read make, model and first registration from the ad")
        valuation = self._exact_valuation(listing)
        self.store.mark_evaluated(listing)  # no second alert for an ad the user already asked about
        if valuation.market_price is None:
            return None, valuation.comparables
        report = self.evaluate(listing, [], f"{listing.make} {listing.model}", force=True, valuation=valuation)
        return report, valuation.comparables
