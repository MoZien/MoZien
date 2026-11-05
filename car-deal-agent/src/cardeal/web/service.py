"""What the web app does: analyse an ad, value a car typed in by hand, hunt for deals, and the AI
extras. All of it reuses the valuation, flip and personal code of the Telegram bot."""

from __future__ import annotations

import logging
import os
import statistics
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, fields
from datetime import datetime, timedelta
from typing import Any

import anthropic
import requests

from cardeal.analyzer import (
    AnalysisError,
    ListingAnalyzer,
    Photo,
    costed_issues,
    repair_costs,
)
from cardeal.config import AISettings, ScraperSettings, ValuationSettings
from cardeal.flip import decide, estimate_flip
from cardeal.geo import road_km, zip_of
from cardeal.models import Comparable, Listing, Valuation
from cardeal.personal import decide_personal, estimate_personal, trade_score
from cardeal.pipeline import NOT_A_CANDIDATE, DealHunter
from cardeal.sources.autohero import AutoheroSource, is_autohero
from cardeal.sources.autoscout24 import AutoScout24Source, is_autoscout24
from cardeal.sources.base import SourceBlockedError
from cardeal.sources.kleinanzeigen import KleinanzeigenSource, listing_from_url
from cardeal.storage import Store
from cardeal.valuation import ad_flags, plausible_km
from cardeal.web.auth import Access, Account
from cardeal.web.device import DEVICE_SCRAPER, DeviceGone, DeviceSession
from cardeal.web.jobs import Job, JobCancelled, UserFacingError
from cardeal.web.photos import ai_photo_choice, ai_photo_urls, load_on_server
from cardeal.web.prefs import HuntCriteria, ManualCar, Prefs

log = logging.getLogger(__name__)

# When Kleinanzeigen says "too many requests" during a hunt: breaks per ad before giving up, and
# their length in seconds.
HUNT_BREAKS = 2
HUNT_BREAK_SECONDS = 60.0
# A hunted car more than this above the broad market price (same model, fuel, PS and years) is
# no deal even if its gearbox or body were worth a bit more: no narrower searches for it.
HUNT_ROUGH_SLACK = 1.05

MAKES = {
    "abarth": "Abarth", "alfa_romeo": "Alfa Romeo", "audi": "Audi", "bmw": "BMW", "byd": "BYD",
    "chevrolet": "Chevrolet", "chrysler": "Chrysler", "citroen": "Citroën", "cupra": "Cupra", "dacia": "Dacia",
    "daewoo": "Daewoo", "daihatsu": "Daihatsu", "dodge": "Dodge", "ds": "DS", "fiat": "Fiat", "ford": "Ford",
    "honda": "Honda", "hyundai": "Hyundai", "infiniti": "Infiniti", "iveco": "Iveco", "jaguar": "Jaguar",
    "jeep": "Jeep", "kia": "Kia", "lada": "Lada", "lancia": "Lancia", "land_rover": "Land Rover", "lexus": "Lexus",
    "maserati": "Maserati", "mazda": "Mazda", "mercedes_benz": "Mercedes-Benz", "mg": "MG", "mini": "MINI",
    "mitsubishi": "Mitsubishi", "nissan": "Nissan", "opel": "Opel", "peugeot": "Peugeot", "polestar": "Polestar",
    "porsche": "Porsche", "renault": "Renault", "rover": "Rover", "saab": "Saab", "seat": "SEAT", "skoda": "Škoda",
    "smart": "smart", "ssangyong": "SsangYong", "subaru": "Subaru", "suzuki": "Suzuki", "tesla": "Tesla",
    "toyota": "Toyota", "volkswagen": "Volkswagen", "volvo": "Volvo",
}
FUELS = {"benzin": "Benzin", "diesel": "Diesel", "elektro": "Elektro", "hybrid": "Hybrid", "lpg": "Autogas (LPG)",
         "cng": "Erdgas (CNG)"}
BODIES = {"kleinwagen": "Kleinwagen", "limousine": "Limousine", "kombi": "Kombi", "suv": "SUV/Geländewagen",
          "coupe": "Coupé", "cabrio": "Cabrio", "bus": "Van/Bus", "andere": "Andere"}
GEARBOXES = {"manuell": "Manuell", "automatik": "Automatik"}


def ai_error_reason(exc: BaseException) -> str:
    """Why an AI call failed, as a code the app can explain in the user's language."""
    if isinstance(exc, AnalysisError):
        return "refused" if "declined" in str(exc) else "output"
    if isinstance(exc, (anthropic.AuthenticationError, anthropic.PermissionDeniedError)):
        return "key"
    if isinstance(exc, anthropic.NotFoundError):
        return "model"
    if isinstance(exc, anthropic.RateLimitError):
        return "rate"
    if isinstance(exc, anthropic.APIConnectionError):  # includes timeouts
        return "network"
    if isinstance(exc, anthropic.BadRequestError):
        text = str(exc).lower()
        return "credit" if "credit" in text or "billing" in text else "request"
    if isinstance(exc, anthropic.APIStatusError) and exc.status_code >= 500:
        return "busy"
    return "other"


def clean_api_key(raw: str | None) -> str | None:
    """A key pasted into a dashboard often carries spaces, quotes or a line break."""
    key = (raw or "").strip().strip("\"'").strip()
    return key or None


class TrackedSource:
    """The shared Kleinanzeigen source as one job sees it: counts requests for the progress bar and
    stops between requests when the job is cancelled."""

    name = "kleinanzeigen"

    def __init__(self, source, job: Job | None):
        self.source, self.job = source, job

    def search(self, criteria, price_ceiling=None, enough=None):
        if self.job is not None:
            self.job.check_cancel()
        found = self.source.search(criteria, price_ceiling=price_ceiling, enough=enough)
        if self.job is not None:
            self.job.bump("searches")
        return found

    def fetch_details(self, listing):
        if self.job is not None:
            self.job.check_cancel()
        listing = self.source.fetch_details(listing)
        if self.job is not None:
            self.job.bump("pages")
        return listing


def _jsonable(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "__dataclass_fields__"):
        return asdict(value)
    return value


def listing_from_json(data: dict) -> Listing:
    known = {f.name for f in fields(Listing)}
    return Listing(**{k: v for k, v in data.items() if k in known})


def valuation_from_json(data: dict) -> Valuation:
    known = {f.name for f in fields(Valuation)}
    values = {k: v for k, v in data.items() if k in known}
    values["used"] = [Comparable(**c) for c in data.get("used") or []]
    return Valuation(**values)


@dataclass
class Fetchers:
    """Where one job gets its pages from and keeps its market data."""

    kleinanzeigen: Any
    autoscout24: Any
    autohero: Any
    store: Store


class CarService:
    def __init__(self, store_path: str, access: Access, ai_model: str = "claude-sonnet-5-5",
                 scraper: ScraperSettings | None = None, source=None, ai_client=None, autoscout24=None,
                 autohero=None, photo_loader: Callable[[list[str]], list[Photo]] | None = None):
        self.store = Store(store_path)
        self.load_photos = photo_loader or load_on_server  # server mode only (device mode: the device)
        self._pruned_at = 0.0
        self._prune()
        self.source = source or KleinanzeigenSource(scraper or ScraperSettings())
        self.autoscout24 = autoscout24 or AutoScout24Source(scraper or ScraperSettings())
        self.autohero = autohero or AutoheroSource(scraper or ScraperSettings())
        self.access = access
        self.ai_model = ai_model
        self._ai_client = ai_client
        self._ai_checked = ai_client is not None

    # --- AI -------------------------------------------------------------------------------------

    @property
    def ai_client(self):
        if not self._ai_checked:
            self._ai_checked = True
            try:
                key = clean_api_key(os.environ.get("ANTHROPIC_API_KEY"))
                client = anthropic.Anthropic(api_key=key) if key else anthropic.Anthropic()
                if client.api_key or client.auth_token:
                    self._ai_client = client
            except anthropic.AnthropicError as exc:
                log.warning("AI disabled: %s", exc)
        return self._ai_client

    @property
    def ai_available(self) -> bool:
        return self.ai_client is not None

    def analyzer(self, prefs: Prefs) -> ListingAnalyzer | None:
        if self.ai_client is None:
            return None
        return ListingAnalyzer(AISettings(model=self.ai_model, effort=prefs.ai_effort), prefs.language,
                               client=self.ai_client)

    # --- the three jobs ---------------------------------------------------------------------------

    def _prune(self) -> None:
        """Ads older than the price lookback no longer count: delete them (at most once a day)."""
        if time.monotonic() - self._pruned_at < 86_400 and self._pruned_at:
            return
        self._pruned_at = time.monotonic()
        days = ValuationSettings().lookback_days
        gone = self.store.prune(datetime.now() - timedelta(days=days))
        if gone:
            log.info("cache: %d ads older than %d days deleted", gone, days)

    def _fetchers(self, job: Job | None) -> Fetchers:
        """Server mode: the shared sources and the shared market cache. Device mode: sources that
        load every page through the user's device, and a store that lives only as long as the job,
        so the server keeps no ads."""
        if job is None or job.device is None:
            return Fetchers(self.source, self.autoscout24, self.autohero, self.store)
        session = DeviceSession(job.device)
        return Fetchers(KleinanzeigenSource(DEVICE_SCRAPER, session=session),
                        AutoScout24Source(DEVICE_SCRAPER, session=session),
                        AutoheroSource(DEVICE_SCRAPER, session=session), Store(":memory:"))

    def _hunter(self, prefs: Prefs, job: Job | None, searches=None, exclude_places=(),
                fetchers: Fetchers | None = None) -> DealHunter:
        self._prune()
        fetchers = fetchers or self._fetchers(job)
        config = prefs.config(self.ai_model, searches)
        config.filters.exclude_places = list(exclude_places)
        return DealHunter(config, TrackedSource(fetchers.kleinanzeigen, job), fetchers.store)

    def analyze_url(self, job: Job, url: str, prefs: Prefs, account: Account) -> dict:
        fetchers = self._fetchers(job)
        hunter = self._hunter(prefs, job, fetchers=fetchers)
        if is_autoscout24(url):
            job.step("ad", "active")
            listing = self._fetch_other(fetchers.autoscout24, url, "AutoScout24")
        elif is_autohero(url):
            job.step("ad", "active")
            listing = self._fetch_other(fetchers.autohero, url, "Autohero")
        else:
            try:
                listing = listing_from_url(url)
            except ValueError:
                raise UserFacingError("bad_url") from None
            job.step("ad", "active")
            listing = self._fetch_ad(hunter, listing)
        job.partial["listing"] = self.listing_json(listing, prefs)
        job.step("ad", "done")
        if not hunter._comparable_searches(listing):
            raise UserFacingError("not_car")
        if not plausible_km(listing):
            raise UserFacingError("bad_km", km=listing.km)
        job.step("market", "active")
        valuation = self._value(hunter, listing)
        job.step("market", "done", comparables=valuation.comparables)
        photos = self._photos(job, listing, valuation, account) if prefs.ai_enabled and prefs.ai_photos else []
        return self.evaluate(listing, valuation, prefs, account, job=job, ai=prefs.ai_enabled, photos=photos)

    def _photos(self, job: Job, listing: Listing, valuation: Valuation, account: Account) -> list[Photo]:
        """The ad's photos for the AI (single checks, and finds of a hunt that the AI reviews):
        loaded by the device in device mode, else by the server. Only when the review will run (no
        photos are loaded for nothing); a failure only means the AI sees no photos."""
        urls = ai_photo_urls(listing.images or [])
        if (not urls or valuation.market_price is None or self.ai_client is None
                or not self.access.has_allowance(account, "ai")):
            job.step("photos", "skipped")
            return []
        job.step("photos", "active")
        try:
            photos = job.device.get_photos(urls) if job.device is not None else self.load_photos(urls)
        except JobCancelled:
            raise
        except Exception as exc:  # incl. a device that went away: the review runs on the text
            log.info("photos for %s not loaded: %r", listing.url, exc, exc_info=True)
            photos = []
        job.step("photos", "done", count=len(photos))
        return photos

    def valuate(self, job: Job, car: ManualCar, prefs: Prefs, account: Account) -> dict:
        listing = Listing(
            id=f"manual:{car.make}:{car.model.lower()}:{car.year}:{car.km}", source="manual", url="",
            title=f"{MAKES.get(car.make, car.make)} {car.model}", price=car.price, negotiable=car.negotiable,
            km=car.km, year=car.year, month=car.month, location=car.zip_code or "",
            make=MAKES.get(car.make, car.make), model=car.model, power_ps=car.power_ps,
            fuel=FUELS.get(car.fuel or ""), fuel_slug=car.fuel, gearbox=GEARBOXES.get(car.gearbox or ""),
            gearbox_slug=car.gearbox, body_type=BODIES.get(car.body_type or ""), body_slug=car.body_type,
            make_slug=car.make, hu_until=car.hu_until, details_loaded=True,
        )
        if not plausible_km(listing):
            raise UserFacingError("bad_km", km=car.km)
        hunter = self._hunter(prefs, job)
        job.step("market", "active")
        valuation = self._value(hunter, listing)
        job.step("market", "done", comparables=valuation.comparables)
        return self.evaluate(listing, valuation, prefs, account, job=job, ai=False)

    def hunt(self, job: Job, criteria: HuntCriteria, prefs: Prefs, account: Account) -> dict:
        search = criteria.search()
        hunter = self._hunter(prefs, job, [search], criteria.exclude_places)
        job.step("search", "active")
        try:
            listings = hunter.source.search(search)
        except SourceBlockedError:
            raise UserFacingError("blocked") from None
        skip = set(criteria.skip_ids)
        candidates = [l for l in listings if l.id not in skip and hunter._is_candidate(l, search)]
        job.step("search", "done", ads=len(listings), candidates=len(candidates))
        job.progress.update(total=min(len(candidates), criteria.max_ads), checked=0, found=0)
        job.partial["found"] = []
        job.step("check", "active")
        for listing in candidates[: criteria.max_ads]:
            if job.cancel_event.is_set() or job.progress["found"] >= criteria.count:
                break
            job.partial["current"] = listing.title
            try:
                result = self._hunt_one_patiently(hunter, listing, prefs, account, job)
            except JobCancelled:
                break  # stopped by the user: keep what was found
            except SourceBlockedError:
                job.partial["stopped"] = "blocked"
                break
            except DeviceGone:
                job.partial["stopped"] = "device"  # the app was closed: keep what was found
                break
            except UserFacingError:
                result = None
            except Exception:  # one odd ad must not end the hunt
                log.exception("hunt: %s failed", listing.url)
                result = None
            job.progress["checked"] += 1
            job.partial.setdefault("checked_ids", []).append(listing.id)
            if result is not None:
                job.partial["found"].append(result)
                job.progress["found"] += 1
        job.partial.pop("current", None)
        job.step("check", "done")
        return {"found": job.partial["found"], "checked": job.progress["checked"], "ads": len(listings),
                "candidates": len(candidates), "stopped": job.partial.get("stopped")}

    def _hunt_one_patiently(self, hunter: DealHunter, listing: Listing, prefs: Prefs, account: Account, job: Job) -> dict | None:
        """Kleinanzeigen slows down busy visitors: after a "too many requests" take a longer break
        (the user can still stop meanwhile) and try the same ad again; give up only when it stays."""
        for attempt in range(HUNT_BREAKS + 1):
            try:
                return self._hunt_one(hunter, listing, prefs, account, job)
            except SourceBlockedError:
                if attempt == HUNT_BREAKS:
                    raise
                log.warning("hunt: Kleinanzeigen is slowing us down, break %d", attempt + 1)
                job.partial["paused"] = True
                try:
                    if job.cancel_event.wait(HUNT_BREAK_SECONDS):
                        raise JobCancelled() from None
                finally:
                    job.partial.pop("paused", None)
        return None

    def _hunt_one(self, hunter: DealHunter, listing: Listing, prefs: Prefs, account: Account, job: Job) -> dict | None:
        listing = hunter.source.fetch_details(listing)
        if ad_flags(listing) & NOT_A_CANDIDATE or not plausible_km(listing):
            return None
        # The broad market price first: a car clearly above it can't be a deal, so the narrower
        # (gearbox, body) searches are only spent on cars that may be one.
        price = listing.price
        valuation = hunter._exact_valuation(
            listing, settled=lambda broad: price is not None and price > broad.market_price * HUNT_ROUGH_SLACK)
        if valuation.market_price is None:
            return None
        # Cheap numbers first: the AI review is only paid for cars that pass them.
        quick = self.evaluate(listing, valuation, prefs, account, ai=False)
        if not self._worth_it(quick, prefs):
            return None
        if prefs.ai_enabled and prefs.ai_in_hunt:
            photos = self._photos(job, listing, valuation, account) if prefs.ai_photos else []
            quick = self.evaluate(listing, valuation, prefs, account, ai=True, photos=photos)
            if not self._worth_it(quick, prefs):
                return None
        return quick

    @staticmethod
    def _worth_it(result: dict, prefs: Prefs) -> bool:
        if prefs.purpose == "trade":
            trade = result["trade"]
            return trade["verdict"] in ("deal", "check") and trade["profit"] >= prefs.min_profit
        personal = result["personal"]
        return personal["verdict"] != "avoid" and personal["rating"] in ("steal", "good")

    def _fetch_ad(self, hunter: DealHunter, listing: Listing) -> Listing:
        try:
            return hunter.source.fetch_details(listing)
        except SourceBlockedError:
            raise UserFacingError("blocked") from None
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code in (404, 410):
                raise UserFacingError("gone") from None
            raise UserFacingError("network", message=str(exc)[:200]) from None
        except requests.RequestException as exc:
            raise UserFacingError("network", message=str(exc)[:200]) from None

    def _fetch_other(self, source, url: str, site: str) -> Listing:
        """An ad from another platform than Kleinanzeigen (AutoScout24, Autohero)."""
        try:
            return source.fetch(url)
        except SourceBlockedError:
            raise UserFacingError("blocked", site=site) from None
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code in (404, 410):
                raise UserFacingError("gone") from None
            raise UserFacingError("network", message=str(exc)[:200]) from None
        except requests.RequestException as exc:
            raise UserFacingError("network", message=str(exc)[:200]) from None
        except ValueError:
            raise UserFacingError("not_car") from None

    def _value(self, hunter: DealHunter, listing: Listing) -> Valuation:
        try:
            return hunter._exact_valuation(listing)
        except SourceBlockedError:
            raise UserFacingError("blocked") from None
        except requests.RequestException as exc:
            raise UserFacingError("network", message=str(exc)[:200]) from None

    # --- the evaluation itself ------------------------------------------------------------------------

    def evaluate(self, listing: Listing, valuation: Valuation, prefs: Prefs, account: Account,
                 job: Job | None = None, ai: bool = True, photos: list[Photo] | tuple = ()) -> dict:
        """Numbers for both purposes (they are cheap), the AI review for the chosen one."""
        config = prefs.config(self.ai_model)
        deal, lang, today = config.deal, prefs.language, datetime.now().date()
        result: dict[str, Any] = {
            "purpose": prefs.purpose, "listing": self.listing_json(listing, prefs),
            "valuation": self.valuation_json(valuation), "trade": None, "personal": None,
            "analysis": None, "analysis_kind": None, "ai_status": "off", "ai_error": None, "costed_issues": [],
            "created_at": datetime.now().isoformat(timespec="seconds"),
        }
        if valuation.market_price is None:
            result["ai_status"] = "skipped"
            return result

        analysis, repairs = None, 0
        if ai:
            result["ai_status"] = self._ai_review(listing, valuation, prefs, account, job, result, photos)
            analysis = result.pop("_analysis", None)
            if analysis is not None:
                repairs = repair_costs(analysis, listing)
                result["costed_issues"] = [i.model_dump() for i in costed_issues(analysis, listing)]
        trade_analysis = analysis if prefs.purpose == "trade" else None
        personal_analysis = analysis if prefs.purpose == "personal" else None

        flip = estimate_flip(listing, valuation, deal, repair_costs=repairs, today=today, trip=config.trip)
        verdict, reasons = decide(listing, valuation, flip, deal, trade_analysis, today, lang)
        result["trade"] = {**asdict(flip), "verdict": verdict, "reasons": reasons, "total_costs": flip.total_costs,
                           "score": trade_score(flip, valuation, verdict, deal, listing, trade_analysis)}

        settings = prefs.personal()
        estimate = estimate_personal(listing, valuation, settings, deal, repair_costs=repairs, today=today,
                                     trip=config.trip)
        p_verdict, p_reasons, p_score = decide_personal(listing, valuation, estimate, settings, deal,
                                                        personal_analysis, lang)
        estimate.verdict, estimate.reasons, estimate.score = p_verdict, p_reasons, p_score
        result["personal"] = asdict(estimate)
        return result

    def _ai_review(self, listing: Listing, valuation: Valuation, prefs: Prefs, account: Account,
                   job: Job | None, result: dict, photos: list[Photo] | tuple = ()) -> str:
        analyzer = self.analyzer(prefs)
        if analyzer is None:
            return "unavailable"
        if not self.access.use(account, "ai"):
            return "quota"
        if job is not None:
            job.step("ai", "active")
        config = prefs.config(self.ai_model)
        try:
            if prefs.purpose == "trade":
                flip = estimate_flip(listing, valuation, config.deal, trip=config.trip)
                analysis = analyzer.analyze(listing, valuation, flip, photos)
            else:
                estimate = estimate_personal(listing, valuation, prefs.personal(), config.deal, trip=config.trip)
                analysis = analyzer.analyze_personal(listing, valuation, estimate, prefs.buyer(), photos)
        except Exception as exc:  # the numbers stand without the AI; say why it is missing
            log.warning("AI review failed for %s: %r", listing.url, exc, exc_info=True)
            result["ai_error"] = ai_error_reason(exc)
            if job is not None:
                job.step("ai", "failed")
            return "failed"
        if job is not None:
            job.step("ai", "done")
        result["_analysis"] = analysis
        result["analysis"] = analysis.model_dump()
        result["photos_checked"] = len(photos)
        places = ai_photo_choice(listing.images or [])
        result["photo_index"] = [places.get(photo.url, -1) for photo in photos]  # photo n is images[index[n-1]]
        result["analysis_kind"] = prefs.purpose
        return "ok"

    # --- AI extras ------------------------------------------------------------------------------------

    def chat(self, context: dict, messages: list[dict], prefs: Prefs, account: Account) -> str:
        analyzer = self.analyzer(prefs)
        if analyzer is None:
            raise UserFacingError("ai_unavailable")
        if not self.access.use(account, "chat"):
            raise UserFacingError("quota")
        conversation = chat_messages(messages)
        if not conversation:
            raise UserFacingError("bad_input")
        try:
            return analyzer.chat(chat_context(context), conversation)
        except Exception as exc:
            log.warning("AI chat failed: %r", exc, exc_info=True)
            raise UserFacingError("ai_failed", reason=ai_error_reason(exc)) from None

    def scan_text(self, text: str, prefs: Prefs, account: Account) -> dict:
        analyzer = self.analyzer(prefs)
        if analyzer is None:
            raise UserFacingError("ai_unavailable")
        if not self.access.use(account, "ai"):
            raise UserFacingError("quota")
        try:
            return analyzer.scan_text(text).model_dump()
        except Exception as exc:
            log.warning("AI text scan failed: %r", exc, exc_info=True)
            raise UserFacingError("ai_failed", reason=ai_error_reason(exc)) from None

    def ai_check(self, prefs: Prefs) -> dict:
        """One tiny request with the app's settings: tells the owner whether key, credit and model work."""
        analyzer = self.analyzer(prefs)
        if analyzer is None:
            return {"ok": False, "reason": "unavailable", "model": self.ai_model}
        try:
            answer = analyzer.chat("(connection test)", [{"role": "user", "content": "Reply with the word OK."}])
        except Exception as exc:
            log.warning("AI check failed: %r", exc, exc_info=True)
            return {"ok": False, "reason": ai_error_reason(exc), "model": self.ai_model, "detail": str(exc)[:300]}
        return {"ok": True, "model": self.ai_model, "answer": answer[:40]}

    # --- JSON ---------------------------------------------------------------------------------------

    def listing_json(self, listing: Listing, prefs: Prefs) -> dict:
        data = asdict(listing)
        data["flags"] = sorted(ad_flags(listing))
        distance = road_km(prefs.home_zip, zip_of(listing.location), prefs.road_factor)
        data["distance_km"] = round(distance) if distance is not None else None
        data["damaged"] = listing.damaged
        return data

    @staticmethod
    def valuation_json(valuation: Valuation) -> dict:
        data = asdict(valuation)
        prices = [c.adjusted * (valuation.local_factor or 1) for c in valuation.used]
        if len(prices) >= 4:
            q1, _, q3 = statistics.quantiles(prices, n=4)
            data["range"] = [round(q1, -1), round(q3, -1)]
        else:
            data["range"] = None
        if valuation.used:
            data["median"] = round(statistics.median(c.adjusted for c in valuation.used), -1)
        return data


def chat_messages(messages: list[dict]) -> list[dict]:
    """The conversation as the API takes it: starts with the user and alternates (a trimmed
    history can start with an answer; two questions in a row are merged)."""
    cleaned: list[dict] = []
    for message in messages:
        content = str(message.get("content", "")).strip()
        if not content or (not cleaned and message.get("role") != "user"):
            continue
        if cleaned and cleaned[-1]["role"] == message["role"]:
            cleaned[-1]["content"] += "\n\n" + content
        else:
            cleaned.append({"role": message["role"], "content": content})
    while cleaned and cleaned[-1]["role"] != "user":
        cleaned.pop()
    return cleaned


def chat_context(result: dict) -> str:
    """The analysis a chat is about, in a few lines the model can read (from the stored result)."""
    listing, valuation = result.get("listing") or {}, result.get("valuation") or {}
    lines = [
        f"Ad: {listing.get('title')} | price {listing.get('price')} € {'VB' if listing.get('negotiable') else ''}",
        (f"Car: {listing.get('make')} {listing.get('model')}, first registration "
         f"{listing.get('month') or '?'}/{listing.get('year')}, {listing.get('km')} km, "
         f"{listing.get('power_ps')} PS, {listing.get('fuel')}, {listing.get('gearbox')}, "
         f"HU until {listing.get('hu_until') or 'unknown'}, location {listing.get('location')}"),
        (f"Market price {valuation.get('market_price')} € from {valuation.get('comparables')} comparables "
         f"({valuation.get('basis')}), confidence {valuation.get('confidence')}"),
        f"Purpose of the user: {'buy to keep' if result.get('purpose') == 'personal' else 'buy to resell'}",
    ]
    if trade := result.get("trade"):
        lines.append(f"Trade numbers: buy {trade.get('buy_price')} €, resale {trade.get('resale_price')} €, costs "
                     f"{trade.get('total_costs')} €, profit {trade.get('profit')} €, verdict {trade.get('verdict')}")
    if personal := result.get("personal"):
        lines.append(f"Personal numbers: rating {personal.get('rating')}, first offer {personal.get('offer_start')} €, "
                     f"most to pay {personal.get('offer_max')} €, fuel per year {personal.get('fuel_per_year')} €, "
                     f"verdict {personal.get('verdict')}")
    if analysis := result.get("analysis"):
        lines.append(f"AI review: {analysis.get('verdict')} - {analysis.get('verdict_reason')}")
        for issue in (analysis.get("issues") or [])[:6]:
            lines.append(f"- issue: {issue.get('issue')} ({issue.get('quote')}) ~{issue.get('cost_eur')} €")
        for finding in (analysis.get("photo_findings") or [])[:6]:
            if isinstance(finding, dict):
                lines.append(f"- seen in photo {finding.get('photo')}: {finding.get('finding')} "
                             f"({finding.get('severity')})")
        if analysis.get("odometer_km_in_photo"):
            lines.append(f"Odometer in a photo: {analysis.get('odometer_km_in_photo')} km")
    description = (listing.get("description") or "")[:3000]
    lines.append(f"Ad text (seller's words):\n{description}")
    return "\n".join(str(line) for line in lines)
