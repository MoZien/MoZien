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

from cardeal.analyzer import AnalysisError, ListingAnalyzer
from cardeal.config import AppConfig
from cardeal.flip import decide, estimate_flip
from cardeal.models import DealReport, Listing, SearchCriteria
from cardeal.notifier import Notifier
from cardeal.sources.base import ListingSource, SourceBlockedError
from cardeal.sources.kleinanzeigen import listing_from_url, make_slug
from cardeal.storage import Store
from cardeal.valuation import estimate_market_price

log = logging.getLogger(__name__)


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

    def _run_search(self, search: SearchCriteria) -> list[DealReport]:
        now = self.clock()
        ceiling = round(search.max_price * self.config.valuation.price_ceiling_factor) if search.max_price else None
        listings = self.source.search(self._market_search(search), price_ceiling=ceiling)
        first_run = not self.store.has_segment(search.segment)
        for listing in listings:
            self.store.upsert(listing, search.segment, now)
        if first_run and not self.config.deal.alert_existing:
            # Ads already online are market data; alerts are for what gets posted next.
            for listing in listings:
                self.store.mark_evaluated(listing)
            log.info("%s: first run, stored %d ads as market data; alerts start with new ads",
                     search.name, len(listings))
            return []
        comps = self.store.comparables(search.segment, now - timedelta(days=self.config.valuation.lookback_days))

        reports = []
        for listing in listings:
            if not self._is_candidate(listing, search) or not self.store.needs_evaluation(listing):
                continue
            report = self.evaluate(listing, comps, search.name)
            self.store.mark_evaluated(listing)
            if report is None:
                continue
            self.store.save_report(report, now)
            reports.append(report)
            if self.notifier and report.verdict in self.config.deal.notify_on:
                self.notifier.send(report)
        log.info("%s: %d listings, %d comparables, %d reports", search.name, len(listings), len(comps), len(reports))
        return reports

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
        self, listing: Listing, comps: list[Listing], search_name: str = "", force: bool = False
    ) -> DealReport | None:
        """Full evaluation of one listing. Returns None when it is clearly no deal
        (unless `force`) or when there is not enough market data."""
        settings = self.config.deal
        today = self.clock().date()

        valuation = estimate_market_price(listing, comps, self.config.valuation)
        if valuation.market_price is None:
            return None
        if not force:
            discount = valuation.discount(listing.price) or 0.0
            if discount < settings.min_discount:
                return None
            # Repairs only lower the profit, so if it fails now it will fail later.
            if estimate_flip(listing, valuation, settings, today=today).profit < settings.min_profit:
                return None

        listing = self.source.fetch_details(listing)
        flip = estimate_flip(listing, valuation, settings, today=today)
        analysis = None
        if self.analyzer is not None:
            try:
                analysis = self.analyzer.analyze(listing, valuation, flip)
                flip = estimate_flip(
                    listing, valuation, settings, repair_costs=analysis.estimated_repair_cost_eur, today=today
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
        if not listing.make or not listing.year:
            raise ValueError("could not read make and first registration from the ad")
        model_query = re.sub(r"^Weitere\s+", "", listing.model or "").strip()
        search = SearchCriteria(
            name=listing.title,
            make=make_slug(listing.make),
            query=model_query.lower(),
            min_year=listing.year - self.config.valuation.year_window,
            max_year=listing.year + self.config.valuation.year_window,
            pages=3,
        )
        now = self.clock()
        for comp in self.source.search(search):
            self.store.upsert(comp, search.segment, now)
        comps = self.store.comparables(search.segment, now - timedelta(days=self.config.valuation.lookback_days))
        return self.evaluate(listing, comps, search_name=search.segment, force=True), len(comps)
