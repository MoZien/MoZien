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
  DATA_DIR            where the comparables cache lives (default ./data)
  APP_NAME            the name shown in the app (default AutoHalle)
  SCRAPE_MIN_DELAY / SCRAPE_MAX_DELAY  pause between requests to Kleinanzeigen in seconds
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
from cardeal.web.jobs import JobManager, UserFacingError
from cardeal.web.mail import MailError, login_email, mailer_from_env
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

log = logging.getLogger(__name__)

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


class ValuateRequest(BaseModel):
    car: ManualCar
    prefs: Prefs = Field(default_factory=Prefs)


class HuntRequest(BaseModel):
    criteria: HuntCriteria = Field(default_factory=HuntCriteria)
    prefs: Prefs = Field(default_factory=Prefs)


class EvaluateRequest(BaseModel):
    listing: dict[str, Any]
    valuation: dict[str, Any]
    prefs: Prefs = Field(default_factory=Prefs)
    ai: bool = False


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
               jobs: JobManager | None = None) -> FastAPI:
    env = os.environ
    app_name = env.get("APP_NAME", "AutoHalle")
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
    app = FastAPI(title=app_name, version=__version__, docs_url="/api/docs", openapi_url="/api/openapi.json")
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
            "account": {"name": current.name, "email": current.email, "admin": current.admin,
                        "usage": access.usage(current)} if current else None,
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

    def start(kind: str, who: Account, steps: list[str], work) -> dict:
        job = jobs.submit(kind, who.id, steps, work)
        return {"job_id": job.id}

    @app.post("/api/jobs/analyze")
    def analyze(body: AnalyzeRequest, who: Account = Depends(account)):
        steps = ["ad", "market", "ai"] if body.prefs.ai_enabled else ["ad", "market"]
        return start("analyze", who, steps, lambda job: service.analyze_url(job, body.url, body.prefs, who))

    @app.post("/api/jobs/valuate")
    def valuate(body: ValuateRequest, who: Account = Depends(account)):
        return start("valuate", who, ["market"], lambda job: service.valuate(job, body.car, body.prefs, who))

    @app.post("/api/jobs/hunt")
    def hunt(body: HuntRequest, who: Account = Depends(account)):
        return start("hunt", who, ["search", "check"], lambda job: service.hunt(job, body.criteria, body.prefs, who))

    @app.get("/api/jobs/active")
    def active_jobs(who: Account = Depends(account)):
        """This user's jobs that still run or wait, so the app can pick them up after a restart."""
        return [{"id": job.id, "kind": job.kind, "status": job.status} for job in jobs.active(who.id)]

    @app.get("/api/jobs/{job_id}")
    def job_status(job_id: str, who: Account = Depends(account)):
        job = jobs.get(job_id, who.id)
        if job is None:
            raise HTTPException(404, detail={"code": "no_job"})
        return job.public(jobs.position(job))

    @app.post("/api/jobs/{job_id}/cancel")
    def cancel(job_id: str, who: Account = Depends(account)):
        return {"cancelled": jobs.cancel(job_id, who.id)}

    @app.post("/api/evaluate")
    async def evaluate(body: EvaluateRequest, who: Account = Depends(account)):
        try:
            listing, valuation = listing_from_json(body.listing), valuation_from_json(body.valuation)
        except TypeError as exc:
            raise HTTPException(400, detail={"code": "bad_input", "message": str(exc)[:200]}) from None
        return await run_in_threadpool(service.evaluate, listing, valuation, body.prefs, who, None, body.ai)

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
