"""HTTP API and the frontend. Start with `cardeal-web` (or `uvicorn cardeal.web.app:create_app --factory`).

Environment:
  ANTHROPIC_API_KEY   Claude API key; without it the app runs without AI reviews
  AI_MODEL            default claude-sonnet-5-5
  GMAIL_SCRIPT_URL + GMAIL_SCRIPT_SECRET (free, from your Gmail via deploy/gmail-sender.gs), or
  BREVO_API_KEY + MAIL_FROM, or GMAIL_USER + GMAIL_APP_PASSWORD: sign-in with a code sent by email
                      (see cardeal/web/mail.py; Render's free plan blocks SMTP)
  ALLOWED_EMAILS      who may sign in by email: name@x.de,@company.de (empty: anyone)
  ADMIN_EMAILS        the owner's address(es): no daily limit, usage report, AI check
  ACCESS_CODES        name:code,name:code ... codes as a second way in (without email and codes: open)
  ADMIN_CODE          code for the owner
  SECRET_KEY          signs login cookies (set it, or logins end at every restart)
  AI_DAILY_LIMIT      AI reviews per account and day (default 40), CHAT_DAILY_LIMIT (default 150)
  AI_GLOBAL_LIMIT     AI reviews per day for all accounts together (default 400), CHAT_GLOBAL_LIMIT (3000)
  JOB_WORKERS         analyses running at the same time (default 2; more means more load on Kleinanzeigen)
  PUBLIC_URL          the app's address for links in emails (default: the address it was called at)
  DATA_DIR            where the comparables cache and the synced data live (default ./data); on
                      Render's free plan this disk is wiped at every deploy (devices then send their
                      data again), a Render disk keeps it
  SYNC_DB             file for the synced saved cars, garage and searches (default DATA_DIR/sync.sqlite3)
  APP_NAME            the name shown in the app (default AutoHalle)
  SCRAPE_MIN_DELAY / SCRAPE_MAX_DELAY  pause between requests to Kleinanzeigen in seconds
  CORS_ORIGINS        origins of the native app (default capacitor://localhost,https://localhost)
  FETCH_MODE          who loads the marketplace pages: device (default: only the app on the phone or
                      the browser helper; the server never contacts the marketplaces and keeps no
                      ads), both (the device when it can, else the server) or server
  LEGAL_NAME, LEGAL_ADDRESS, LEGAL_EMAIL, LEGAL_PHONE, LEGAL_VAT_ID
                      the operator for Impressum, privacy policy and terms (address lines split by ";")
"""

from __future__ import annotations

import logging
import os
import secrets
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from cardeal import __version__
from cardeal.config import ScraperSettings
from cardeal.geo import road_km
from cardeal.web.auth import (
    COOKIE,
    SESSION_DAYS,
    Access,
    Account,
    EmailLogin,
    email_list,
)
from cardeal.web.device import MAX_PAGE_CHARS, wait_for_change
from cardeal.web.jobs import JobManager, UserFacingError
from cardeal.web.mail import MailError, login_email, mailer_from_env
from cardeal.web.photos import MAX_PHOTOS, ai_photo_urls, photos_from_device
from cardeal.web.prefs import HuntCriteria, ManualCar, Prefs
from cardeal.web.service import (
    BODIES,
    FUELS,
    GEARBOXES,
    MAKES,
    CarService,
    listing_from_json,
    valuation_from_json,
)
from cardeal.web.sync import COLLECTIONS as SYNC_COLLECTIONS
from cardeal.web.sync import SyncError, SyncStore

log = logging.getLogger(__name__)

# Long polling: the longest a status request waits for a change, and how long the answer to a
# delivered page waits for the job's next request (the job pauses 1-2.5 s between pages).
MAX_WAIT_SECONDS = 8.0
CHAIN_WAIT_SECONDS = 4.0
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parents[3] / "frontend" / "dist"))


class LoginRequest(BaseModel):
    code: str = Field(min_length=1, max_length=200)


class EmailStartRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    language: str = Field(default="de", pattern=r"^(ar|de|en)$")


class EmailVerifyRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    code: str = Field(min_length=4, max_length=20)


class AnalyzeRequest(BaseModel):
    url: str = Field(min_length=10, max_length=500)
    prefs: Prefs = Field(default_factory=Prefs)
    device: bool = False  # the app can load the pages itself (native app or browser extension)


class ValuateRequest(BaseModel):
    car: ManualCar
    prefs: Prefs = Field(default_factory=Prefs)
    device: bool = False


class HuntRequest(BaseModel):
    criteria: HuntCriteria = Field(default_factory=HuntCriteria)
    prefs: Prefs = Field(default_factory=Prefs)
    device: bool = False


class SyncManifest(BaseModel):
    manifest: dict[str, str] = Field(default_factory=dict)


class SyncPush(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list, max_length=100)


class DevicePage(BaseModel):
    """A page the device loaded for a job (or why it couldn't)."""

    id: int
    status: int = 0
    url: str = Field(default="", max_length=2000)
    body: str = Field(default="", max_length=MAX_PAGE_CHARS)
    error: str | None = Field(default=None, max_length=300)


def photo_check(prefs: Prefs) -> Prefs:
    """An app from before the photo check (an older native build) doesn't send ai_photos and can't
    load photos: its jobs run without."""
    return prefs if "ai_photos" in prefs.model_fields_set else prefs.model_copy(update={"ai_photos": False})


class SentPhoto(BaseModel):
    """An ad photo the app loaded and shrank itself (base64 JPEG, ~100-300 KB), for a new AI review."""

    url: str = Field(max_length=2000)
    data: str = Field(max_length=1_500_000)


class EvaluateRequest(BaseModel):
    listing: dict[str, Any]
    valuation: dict[str, Any]
    prefs: Prefs = Field(default_factory=Prefs)
    ai: bool = False
    photos: list[SentPhoto] = Field(default_factory=list, max_length=MAX_PHOTOS)


class ChatMessage(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(min_length=1, max_length=20_000)


class ChatRequest(BaseModel):
    context: dict[str, Any]
    messages: list[ChatMessage] = Field(min_length=1, max_length=30)
    prefs: Prefs = Field(default_factory=Prefs)


class AiCheckRequest(BaseModel):
    prefs: Prefs = Field(default_factory=Prefs)


class ScanRequest(BaseModel):
    text: str = Field(min_length=20, max_length=12_000)
    prefs: Prefs = Field(default_factory=Prefs)


def create_app(service: CarService | None = None, access: Access | None = None,
               jobs: JobManager | None = None, sync: SyncStore | None = None) -> FastAPI:
    env = os.environ
    app_name = env.get("APP_NAME", "AutoHalle")
    fetch_mode = env.get("FETCH_MODE", "device").strip().lower()
    if fetch_mode not in ("device", "server", "both"):
        fetch_mode = "device"
    # Who runs the app, for Impressum and privacy policy (public on purpose).
    legal = {
        "name": env.get("LEGAL_NAME", "").strip(),
        "address": [line.strip() for line in env.get("LEGAL_ADDRESS", "").split(";") if line.strip()],
        "email": env.get("LEGAL_EMAIL", "").strip(),
        "phone": env.get("LEGAL_PHONE", "").strip(),
        "vat_id": env.get("LEGAL_VAT_ID", "").strip(),
    }
    if access is None:
        secret = env.get("SECRET_KEY") or secrets.token_hex(32)
        mailer = mailer_from_env(env, app_name)
        email = EmailLogin(mailer, secret.encode(), allowed=email_list(env.get("ALLOWED_EMAILS")),
                           admins=email_list(env.get("ADMIN_EMAILS"))) if mailer else None
        access = Access(
            env.get("ACCESS_CODES"), secret, env.get("ADMIN_CODE"), email=email,
            ai_daily_limit=int(env.get("AI_DAILY_LIMIT", "40")), chat_daily_limit=int(env.get("CHAT_DAILY_LIMIT", "150")),
            ai_global_limit=int(env.get("AI_GLOBAL_LIMIT", "400")),
            chat_global_limit=int(env.get("CHAT_GLOBAL_LIMIT", "3000")),
        )
    if service is None:
        data_dir = Path(env.get("DATA_DIR", "data"))
        data_dir.mkdir(parents=True, exist_ok=True)
        scraper = ScraperSettings(min_delay_seconds=float(env.get("SCRAPE_MIN_DELAY", "3")),
                                  max_delay_seconds=float(env.get("SCRAPE_MAX_DELAY", "6")))
        service = CarService(str(data_dir / "cache.sqlite3"), access, env.get("AI_MODEL", "claude-sonnet-5-5"), scraper)
    jobs = jobs or JobManager(workers=int(env.get("JOB_WORKERS", "2")))
    sync = sync or SyncStore(env.get("SYNC_DB") or Path(env.get("DATA_DIR", "data")) / "sync.sqlite3")
    app = FastAPI(title=app_name, version=__version__, docs_url="/api/docs", openapi_url="/api/openapi.json")
    # The native app's pages come from capacitor://localhost (iOS) or https://localhost (Android).
    # Its requests normally go through the native HTTP layer (no CORS); this covers the rest.
    origins = [o.strip() for o in env.get("CORS_ORIGINS", "capacitor://localhost,https://localhost").split(",") if o.strip()]
    if origins:
        app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                           allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
    app.state.service, app.state.access, app.state.jobs = service, access, jobs

    @app.exception_handler(UserFacingError)
    async def user_error(_: Request, exc: UserFacingError):
        status = {"quota": 429, "too_many_jobs": 429, "too_soon": 429, "too_many_codes": 429, "ai_unavailable": 503,
                  "blocked": 503, "mail_failed": 503, "not_allowed": 403}.get(exc.code, 400)
        return JSONResponse({"error": {"code": exc.code, **exc.details}}, status_code=status)

    def account(request: Request) -> Account:
        found = access.account(request.cookies.get(COOKIE))
        if found is None:
            raise HTTPException(401, detail={"code": "login"})
        return found

    @app.get("/health")
    def health():
        return {"ok": True, "version": __version__, "commit": env.get("RENDER_GIT_COMMIT", "")[:12]}

    @app.get("/api/meta")
    def meta(request: Request):
        current = access.account(request.cookies.get(COOKIE))
        return {
            "app_name": app_name, "version": __version__, "ai_available": service.ai_available,
            "ai_model": service.ai_model, "auth_required": not access.open, "login": access.methods,
            "account": {"id": current.id, "name": current.name, "email": current.email, "admin": current.admin,
                        "usage": access.usage(current)} if current else None,
            "legal": legal, "fetch_mode": fetch_mode,
            "makes": MAKES, "fuels": FUELS, "bodies": BODIES, "gearboxes": GEARBOXES,
            "defaults": Prefs().model_dump(), "hunt_defaults": HuntCriteria().model_dump(),
        }

    def sign_in(found: Account, request: Request, response: Response) -> dict:
        # Secure on HTTPS (Render forwards the scheme); a plain-HTTP local run needs it off.
        response.set_cookie(COOKIE, access.token(found), max_age=SESSION_DAYS * 86400, httponly=True,
                            samesite="lax", secure=request.url.scheme == "https")
        return {"name": found.name, "email": found.email, "admin": found.admin}

    @app.post("/api/auth/login")
    def login(body: LoginRequest, request: Request, response: Response):
        found = access.login(body.code)
        if found is None:
            raise HTTPException(401, detail={"code": "bad_code"})
        return sign_in(found, request, response)

    @app.post("/api/auth/email/start")
    async def email_start(body: EmailStartRequest, request: Request):
        if access.email is None:
            raise HTTPException(404, detail={"code": "no_email_login"})
        ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0]
        email, code = access.email.request_code(body.email, ip.strip())
        base = (env.get("PUBLIC_URL") or str(request.base_url)).rstrip("/")
        link = f"{base}/#/login?{urlencode({'email': email, 'code': code})}"
        subject, text, html_body = login_email(code, link, body.language, app_name, access.email.code_minutes)
        try:
            await run_in_threadpool(access.email.mailer.send, email, subject, text, html_body)
        except MailError as exc:
            log.error("login email to %s failed: %s", email, exc)
            access.email.forget(email)
            raise UserFacingError("mail_failed") from None
        return {"sent": True, "email": email, "minutes": access.email.code_minutes}

    @app.post("/api/auth/email/verify")
    def email_verify(body: EmailVerifyRequest, request: Request, response: Response):
        if access.email is None:
            raise HTTPException(404, detail={"code": "no_email_login"})
        return sign_in(access.email.verify(body.email, body.code), request, response)

    @app.post("/api/auth/logout")
    def logout(response: Response):
        response.delete_cookie(COOKIE)
        return {"ok": True}

    @app.post("/api/account/delete")
    def delete_account(response: Response, current: Account = Depends(account)):
        """Deletes what the server keeps about the account (sign-in data, usage, jobs, its synced
        cars, garage and searches) and signs it out; the app deletes the account's data on the device."""
        access.erase(current)
        jobs.erase(current.id)
        sync.erase(current.id)
        response.delete_cookie(COOKIE)
        log.info("account deleted: %s", current.id)
        return {"deleted": True}

    def start(kind: str, who: Account, steps: list[str], work, device: bool) -> dict:
        # Device mode when the app can load pages itself and the server allows it; FETCH_MODE=device
        # turns the server's own requests off (the app then has to be the native app or have the
        # browser extension).
        if fetch_mode == "device" and not device:
            raise UserFacingError("needs_device")
        job = jobs.submit(kind, who.id, steps, work, device=device and fetch_mode != "server")
        return {"job_id": job.id, "device": job.device is not None}

    @app.post("/api/jobs/analyze")
    def analyze(body: AnalyzeRequest, who: Account = Depends(account)):
        prefs = photo_check(body.prefs)
        steps = ["ad", "market"]
        if prefs.ai_enabled:
            steps += ["photos", "ai"] if prefs.ai_photos else ["ai"]
        return start("analyze", who, steps, lambda job: service.analyze_url(job, body.url, prefs, who), body.device)

    @app.post("/api/jobs/valuate")
    def valuate(body: ValuateRequest, who: Account = Depends(account)):
        return start("valuate", who, ["market"], lambda job: service.valuate(job, body.car, body.prefs, who),
                     body.device)

    @app.post("/api/jobs/hunt")
    def hunt(body: HuntRequest, who: Account = Depends(account)):
        prefs = photo_check(body.prefs)
        return start("hunt", who, ["search", "check"],
                     lambda job: service.hunt(job, body.criteria, prefs, who), body.device)

    @app.get("/api/jobs/active")
    def active_jobs(who: Account = Depends(account)):
        """This user's jobs that still run or wait, so the app can pick them up after a restart."""
        return [{"id": job.id, "kind": job.kind, "status": job.status} for job in jobs.active(who.id)]

    @app.get("/api/jobs/{job_id}")
    def job_status(job_id: str, who: Account = Depends(account), since: int | None = None, wait: float = 0):
        """The job's state. With `since` (the version the app has) and `wait` (seconds) it answers as
        soon as something changed, e.g. the job needs the device to load a page."""
        job = jobs.get(job_id, who.id)
        if job is None:
            raise HTTPException(404, detail={"code": "no_job"})
        wait_for_change(job, since, min(max(wait, 0.0), MAX_WAIT_SECONDS))
        return job.public(jobs.position(job))

    @app.post("/api/jobs/{job_id}/fetch")
    def device_page(job_id: str, page: DevicePage, who: Account = Depends(account)):
        """The device delivers a page the job asked for; the answer is the job's next state (often
        the next page it needs), so the app doesn't have to poll for it."""
        job = jobs.get(job_id, who.id)
        if job is None or job.device is None:
            raise HTTPException(404, detail={"code": "no_job"})
        version = job.version
        delivered = job.device.deliver(page.id, page.status, page.body, page.url, page.error)
        if delivered:
            wait_for_change(job, version + 1, CHAIN_WAIT_SECONDS)  # +1: the delivery itself
        return {**job.public(jobs.position(job)), "delivered": delivered}

    @app.post("/api/jobs/{job_id}/cancel")
    def cancel(job_id: str, who: Account = Depends(account)):
        return {"cancelled": jobs.cancel(job_id, who.id)}

    def syncing(who: Account = Depends(account)) -> Account:
        # Only real accounts sync: in open mode everybody is the same "public" account.
        if access.open or who.id == "public":
            raise HTTPException(404, detail={"code": "no_sync"})
        return who

    def sync_collection(collection: str) -> str:
        if collection not in SYNC_COLLECTIONS:
            raise HTTPException(404, detail={"code": "no_sync"})
        return collection

    @app.post("/api/sync/{collection}/reconcile")
    def sync_reconcile(collection: str, body: SyncManifest, who: Account = Depends(syncing)):
        """The device says what it has (id -> last change); the answer says what the server needs
        from it and gives it what is newer here."""
        if len(body.manifest) > 3 * SYNC_COLLECTIONS[sync_collection(collection)]:
            raise UserFacingError("bad_sync")
        return sync.reconcile(who.id, collection, body.manifest)

    @app.post("/api/sync/{collection}")
    def sync_push(collection: str, body: SyncPush, who: Account = Depends(syncing)):
        try:
            return sync.put(who.id, sync_collection(collection), body.items)
        except SyncError:
            raise UserFacingError("bad_sync") from None

    @app.post("/api/evaluate")
    async def evaluate(body: EvaluateRequest, who: Account = Depends(account)):
        try:
            listing, valuation = listing_from_json(body.listing), valuation_from_json(body.valuation)
        except TypeError as exc:
            raise HTTPException(400, detail={"code": "bad_input", "message": str(exc)[:200]}) from None
        photos = []
        if body.ai and body.prefs.ai_photos and body.photos:
            photos = photos_from_device([photo.model_dump() for photo in body.photos], ai_photo_urls(listing.images or []))
        return await run_in_threadpool(service.evaluate, listing, valuation, body.prefs, who, None, body.ai, photos)

    @app.post("/api/ai/chat")
    async def chat(body: ChatRequest, who: Account = Depends(account)):
        messages = [m.model_dump() for m in body.messages]
        answer = await run_in_threadpool(service.chat, body.context, messages, body.prefs, who)
        return {"answer": answer, "usage": access.usage(who)}

    @app.post("/api/ai/scan")
    async def scan(body: ScanRequest, who: Account = Depends(account)):
        return await run_in_threadpool(service.scan_text, body.text, body.prefs, who)

    @app.get("/api/tools/distance")
    def distance(origin: str, target: str, road_factor: float = 1.3):
        km = road_km(origin, target, road_factor)
        if km is None:
            raise HTTPException(404, detail={"code": "unknown_zip"})
        return {"km": round(km)}

    @app.post("/api/admin/ai-check")
    async def ai_check(body: AiCheckRequest, who: Account = Depends(account)):
        if not (who.admin or access.open):
            raise HTTPException(403, detail={"code": "admin_only"})
        return await run_in_threadpool(service.ai_check, body.prefs)

    @app.get("/api/admin/usage")
    def usage(who: Account = Depends(account)):
        if not who.admin:
            raise HTTPException(403, detail={"code": "admin_only"})
        return {"usage": access.report(), "jobs": len(jobs.jobs)}

    if FRONTEND_DIST.is_dir():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def frontend(path: str):
            if path.startswith("api/"):
                raise HTTPException(404)
            file = (FRONTEND_DIST / path).resolve()
            if path and file.is_file() and FRONTEND_DIST.resolve() in file.parents:
                return FileResponse(file)
            # The marker tells the service worker this is our page (not a host's wake-up page).
            return FileResponse(FRONTEND_DIST / "index.html", headers={"Cache-Control": "no-cache", "X-AutoHalle": "1"})

    return app


def main() -> None:
    import uvicorn

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    uvicorn.run("cardeal.web.app:create_app", factory=True, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")),
                proxy_headers=True, forwarded_allow_ips="*")


if __name__ == "__main__":
    main()
