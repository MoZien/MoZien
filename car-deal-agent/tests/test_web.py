import time
from dataclasses import replace
from types import SimpleNamespace

import pytest
import requests
from fastapi.testclient import TestClient
from helpers import issue, make_analysis

from cardeal.analyzer import ListingAnalysis, PersonalAnalysis, TextScan, WeakPoint
from cardeal.models import Listing
from cardeal.web.app import create_app
from cardeal.web.auth import Access
from cardeal.web.jobs import JobManager
from cardeal.web.service import CarService

AD = "https://www.kleinanzeigen.de/s-anzeige/vw-golf-1-4/3546000001-216-1"
GOLF = dict(title="VW Golf 1.4 TSI", price=6_000, negotiable=True, year=2014, month=6, km=100_000,
            location="04109 Leipzig", make="Volkswagen", model="Golf", power_ps=122, fuel="Benzin",
            gearbox="Manuell", make_slug="volkswagen", model_slug="golf", fuel_slug="benzin",
            gearbox_slug="manuell", hu_until="08/2027", description="Scheckheft. Klima muss befüllt werden.",
            images=["https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/1?rule=$_59.AUTO"])


def comps(prefix, n=20, price=9_000):
    return [Listing(id=f"kleinanzeigen:{prefix}{i}", source="kleinanzeigen", url=f"https://k/{prefix}{i}",
                    title="VW Golf", price=price + (i % 5) * 100, year=2014, month=i % 12 + 1,
                    km=95_000 + 997 * i, location="80331 München") for i in range(n)]


class FakeKleinanzeigen:
    name = "kleinanzeigen"

    def __init__(self, details=None, hunt_results=(), status=None):
        self.details = details if details is not None else {"kleinanzeigen:3546000001": GOLF}
        self.hunt_results = list(hunt_results)
        self.status = status
        self.searches = []
        self.detail_calls = []

    def search(self, criteria, price_ceiling=None):
        self.searches.append(criteria)
        if criteria.name == "hunt":
            return [replace(listing) for listing in self.hunt_results]
        return comps(f"{criteria.model or criteria.query}-{criteria.gearbox}-")

    def fetch_details(self, listing):
        self.detail_calls.append(listing.id)
        if self.status:
            response = requests.Response()
            response.status_code = self.status
            raise requests.HTTPError(response=response)
        for key, value in self.details.get(listing.id, {}).items():
            setattr(listing, key, value)
        listing.details_loaded = True
        return listing


class FakeClaude:
    def __init__(self):
        self.requests = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(parse=self._parse, create=self._create))

    def _parse(self, **request):
        self.requests.append(request)
        kind = request["output_format"]
        if kind is ListingAnalysis:
            parsed = make_analysis(verdict_reason="trade view", issues=[issue()])
        elif kind is PersonalAnalysis:
            parsed = PersonalAnalysis(
                verdict="buy", verdict_reason="personal view", reliability=4, issues=[issue()],
                known_weak_points=[WeakPoint(item="Steuerkette", typical_cost_eur=900, how_to_check="Kaltstart")],
                positives=["Scheckheft"], negatives=[], inspection_checklist=["Kaltstart"], questions_for_seller=[],
                suitability="passt", yearly_upkeep_eur=600, scam_risk="low", scam_signals=[], negotiation_tip="",
                seller_message="Guten Tag",
            )
        else:
            parsed = TextScan(summary="ok", issues=[], red_flags=[], scam_risk="low", scam_signals=[],
                              questions_for_seller=[])
        return SimpleNamespace(stop_reason="end_turn", parsed_output=parsed)

    def _create(self, **request):
        self.requests.append(request)
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="Kaltstart prüfen.")])


def make_client(source=None, codes=None, ai=True, ai_limit=40, tmp_path=None):
    access = Access(codes, "test-secret", ai_daily_limit=ai_limit)
    service = CarService(str(tmp_path / "cache.sqlite3"), access, source=source or FakeKleinanzeigen(),
                         ai_client=FakeClaude() if ai else None)
    if not ai:
        service._ai_checked, service._ai_client = True, None
    app = create_app(service=service, access=access, jobs=JobManager())
    return TestClient(app), service


def wait(client, job_id, timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("done", "error", "cancelled"):
            return job
        time.sleep(0.02)
    raise AssertionError("job did not finish")


def analyze(client, purpose="trade", **prefs):
    job_id = client.post("/api/jobs/analyze", json={"url": AD, "prefs": {"purpose": purpose, **prefs}}).json()["job_id"]
    return wait(client, job_id)


def test_health_and_meta(tmp_path):
    client, _ = make_client(tmp_path=tmp_path)
    assert client.get("/health").json()["ok"]
    meta = client.get("/api/meta").json()
    assert meta["auth_required"] is False and meta["ai_available"] is True
    assert meta["makes"]["volkswagen"] == "Volkswagen" and meta["defaults"]["purpose"] == "trade"


def test_access_codes_gate_the_api(tmp_path):
    client, _ = make_client(codes="Kha:geheim1,Mo:geheim2", tmp_path=tmp_path)
    assert client.post("/api/jobs/analyze", json={"url": AD}).status_code == 401
    assert client.post("/api/auth/login", json={"code": "falsch"}).status_code == 401
    assert client.post("/api/auth/login", json={"code": "geheim1"}).json()["name"] == "Kha"
    assert analyze(client)["status"] == "done"
    assert client.get("/api/meta").json()["account"]["name"] == "Kha"
    client.post("/api/auth/logout")
    assert client.post("/api/jobs/analyze", json={"url": AD}).status_code == 401


def test_analysis_has_numbers_for_both_purposes_and_the_review_for_the_chosen_one(tmp_path):
    client, service = make_client(tmp_path=tmp_path)
    trade = analyze(client, "trade")
    assert trade["status"] == "done", trade
    result = trade["result"]
    assert [s["state"] for s in trade["steps"]] == ["done", "done", "done"]
    assert result["listing"]["images"] and result["listing"]["distance_km"] > 0
    market = result["valuation"]["market_price"]
    assert 9_000 < market < 9_500 and result["valuation"]["comparables"] >= 8
    assert result["analysis_kind"] == "trade" and result["analysis"]["verdict_reason"] == "trade view"
    assert result["trade"]["repair_costs"] == 300  # quoted "Klima muss befüllt werden"
    assert result["trade"]["profit"] == (result["trade"]["resale_price"] - result["trade"]["buy_price"]
                                         - result["trade"]["total_costs"])
    assert result["personal"]["rating"] == "steal" and 0 <= result["trade"]["score"] <= 100

    personal = analyze(client, "personal", annual_km=20_000)["result"]
    assert personal["analysis_kind"] == "personal" and personal["analysis"]["reliability"] == 4
    assert personal["personal"]["fuel_per_year"] == round(20_000 / 100 * personal["personal"]["consumption"] * 2.10)
    assert personal["personal"]["verdict"] in ("buy", "check") and personal["personal"]["offer_max"] <= 6_000
    kinds = [r["output_format"].__name__ for r in service.ai_client.requests]
    assert kinds == ["ListingAnalysis", "PersonalAnalysis"]


def test_errors_come_back_as_codes(tmp_path):
    client, _ = make_client(source=FakeKleinanzeigen(status=404), tmp_path=tmp_path)
    assert analyze(client)["error"]["code"] == "gone"
    job_id = client.post("/api/jobs/analyze", json={"url": "https://example.com/s-anzeige/123456"}).json()["job_id"]
    assert wait(client, job_id)["error"]["code"] == "bad_url"

    broken = {"kleinanzeigen:3546000001": {**GOLF, "km": 114, "year": 2007}}
    client, _ = make_client(source=FakeKleinanzeigen(details=broken), tmp_path=tmp_path)
    assert analyze(client)["error"] == {"code": "bad_km", "km": 114}

    client, _ = make_client(source=FakeKleinanzeigen(details={"kleinanzeigen:3546000001": {"title": "Sofa"}}),
                            tmp_path=tmp_path)
    assert analyze(client)["error"]["code"] == "not_car"


def test_without_ai_key_the_numbers_still_work(tmp_path):
    client, _ = make_client(ai=False, tmp_path=tmp_path)
    result = analyze(client)["result"]
    assert result["ai_status"] == "unavailable" and result["analysis"] is None
    assert result["trade"]["verdict"] in ("deal", "check")


def test_daily_ai_allowance(tmp_path):
    client, _ = make_client(codes="Kha:x1", ai_limit=1, tmp_path=tmp_path)
    client.post("/api/auth/login", json={"code": "x1"})
    assert analyze(client)["result"]["ai_status"] == "ok"
    assert analyze(client)["result"]["ai_status"] == "quota"


def test_manual_valuation_searches_by_model_name(tmp_path):
    source = FakeKleinanzeigen()
    client, _ = make_client(source=source, tmp_path=tmp_path)
    car = {"make": "volkswagen", "model": "Golf", "year": 2014, "km": 100_000, "power_ps": 122, "fuel": "benzin",
           "gearbox": "manuell", "price": 8_000}
    job = wait(client, client.post("/api/jobs/valuate", json={"car": car}).json()["job_id"])
    assert job["status"] == "done", job
    assert source.searches[0].query == "golf" and source.searches[0].make == "volkswagen"
    assert 9_000 < job["result"]["valuation"]["market_price"] < 9_500 and job["result"]["analysis"] is None


def test_hunt_finds_cheap_cars_skips_seen_ones_and_stops(tmp_path):
    cheap = [Listing(id=f"kleinanzeigen:h{i}", source="kleinanzeigen", url=f"https://k/h{i}", title="VW Golf",
                     price=2_500 + i, year=2014, km=100_000, location="06108 Halle") for i in range(5)]
    details = {c.id: {**GOLF, "price": c.price} for c in cheap}
    source = FakeKleinanzeigen(details=details, hunt_results=cheap)
    client, _ = make_client(source=source, tmp_path=tmp_path)
    body = {"criteria": {"count": 2, "max_ads": 5, "max_price": 3_000, "min_year": 2010,
                         "skip_ids": ["kleinanzeigen:h0"]},
            "prefs": {"purpose": "trade", "ai_in_hunt": False}}
    job = wait(client, client.post("/api/jobs/hunt", json=body).json()["job_id"])
    assert job["status"] == "done", job
    assert [r["listing"]["id"] for r in job["result"]["found"]] == ["kleinanzeigen:h1", "kleinanzeigen:h2"]
    assert job["result"]["checked"] == 2 and "kleinanzeigen:h0" not in source.detail_calls


def test_evaluate_again_with_other_settings(tmp_path):
    client, _ = make_client(tmp_path=tmp_path)
    result = analyze(client)["result"]
    again = client.post("/api/evaluate", json={"listing": result["listing"], "valuation": result["valuation"],
                                               "prefs": {"resale_factor": 0.85}}).json()
    assert again["trade"]["resale_price"] == round(result["valuation"]["market_price"] * 0.85)
    assert again["valuation"]["used"] == result["valuation"]["used"]


def test_chat_and_text_scan(tmp_path):
    client, service = make_client(tmp_path=tmp_path)
    result = analyze(client)["result"]
    answer = client.post("/api/ai/chat", json={"context": result,
                                               "messages": [{"role": "user", "content": "Was prüfen?"}]}).json()
    assert answer["answer"] == "Kaltstart prüfen."
    system = service.ai_client.requests[-1]["system"]
    assert "VW Golf 1.4 TSI" in system and f"Market price {result['valuation']['market_price']}" in system
    scan = client.post("/api/ai/scan", json={"text": "Verkaufe Golf, Klima muss befüllt werden, TÜV neu."}).json()
    assert scan["scam_risk"] == "low"


def test_chat_without_ai_key_is_reported(tmp_path):
    client, _ = make_client(ai=False, tmp_path=tmp_path)
    response = client.post("/api/ai/chat", json={"context": {}, "messages": [{"role": "user", "content": "hi"}]})
    assert response.status_code == 503 and response.json()["error"]["code"] == "ai_unavailable"


def test_distance_tool(tmp_path):
    client, _ = make_client(tmp_path=tmp_path)
    assert 100 < client.get("/api/tools/distance", params={"origin": "06108", "target": "10115"}).json()["km"] < 250
    assert client.get("/api/tools/distance", params={"origin": "06108", "target": "00000"}).status_code == 404


@pytest.mark.parametrize("code", ["too_many_jobs"])
def test_one_user_cannot_flood_the_queue(tmp_path, code):
    from cardeal.web.jobs import UserFacingError
    jobs = JobManager(max_per_owner=1)
    import threading
    gate = threading.Event()
    jobs.submit("x", "u", [], lambda job: gate.wait(5))
    with pytest.raises(UserFacingError) as exc:
        jobs.submit("x", "u", [], lambda job: None)
    assert exc.value.code == code
    gate.set()


class FailingClaude(FakeClaude):
    """Raises the given error on every request, like the real API with a bad key or no credit."""

    def __init__(self, error):
        super().__init__()
        self.error = error
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._fail, parse=self._fail))

    def _fail(self, **request):
        raise self.error


def api_error(cls, status, message):
    import httpx
    response = httpx.Response(status, request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"),
                              json={"type": "error", "error": {"type": "x", "message": message}})
    return cls(message, response=response, body=None)


@pytest.mark.parametrize(("error", "reason"), [
    ("auth", "key"), ("credit", "credit"), ("model", "model"), ("network", "network"), ("boom", "other"),
])
def test_ai_failures_say_why(tmp_path, error, reason):
    import anthropic
    import httpx
    errors = {
        "auth": api_error(anthropic.AuthenticationError, 401, "invalid x-api-key"),
        "credit": api_error(anthropic.BadRequestError, 400, "Your credit balance is too low to access the API."),
        "model": api_error(anthropic.NotFoundError, 404, "model: claude-x"),
        "network": anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.anthropic.com")),
        "boom": ValueError("Illegal header value"),
    }
    client, service = make_client(tmp_path=tmp_path)
    result = analyze(client)["result"]
    service._ai_client = FailingClaude(errors[error])
    response = client.post("/api/ai/chat", json={"context": result, "messages": [{"role": "user", "content": "Hi?"}]})
    assert response.status_code == 400
    assert response.json()["error"] == {"code": "ai_failed", "reason": reason}
    evaluated = client.post("/api/evaluate", json={"listing": result["listing"], "valuation": result["valuation"],
                                                  "prefs": {"purpose": "trade"}, "ai": True}).json()
    assert evaluated["ai_status"] == "failed" and evaluated["ai_error"] == reason
    check = client.post("/api/admin/ai-check", json={}).json()
    assert check["ok"] is False and check["reason"] == reason


def test_ai_check_and_trimmed_chat_history(tmp_path):
    from cardeal.web.service import chat_messages, clean_api_key
    client, service = make_client(tmp_path=tmp_path)
    assert client.post("/api/admin/ai-check", json={}).json()["ok"] is True
    history = [{"role": "assistant", "content": "earlier answer"}, {"role": "user", "content": "a"},
               {"role": "user", "content": "b"}, {"role": "assistant", "content": "c"}, {"role": "user", "content": "d"}]
    assert chat_messages(history) == [{"role": "user", "content": "a\n\nb"}, {"role": "assistant", "content": "c"},
                                      {"role": "user", "content": "d"}]
    result = analyze(client)["result"]
    long_answer = "x" * 9_000  # a long earlier answer must not make the next question fail
    response = client.post("/api/ai/chat", json={"context": result, "messages": [
        {"role": "assistant", "content": "intro"}, {"role": "user", "content": "q1"},
        {"role": "assistant", "content": long_answer}, {"role": "user", "content": "q2"}]})
    assert response.status_code == 200
    assert service.ai_client.requests[-1]["messages"][0] == {"role": "user", "content": "q1"}
    assert clean_api_key(' "sk-ant-abc"\n') == "sk-ant-abc" and clean_api_key("  ") is None


class FakeMailer:
    def __init__(self, fail=False):
        self.sent, self.fail = [], fail

    def send(self, to, subject, text, html_body):
        from cardeal.web.mail import MailError
        if self.fail:
            raise MailError("smtp down")
        self.sent.append(SimpleNamespace(to=to, subject=subject, text=text, html=html_body))


def email_client(tmp_path, mailer=None, allowed="", admins="boss@example.com", **limits):
    from cardeal.web.auth import EmailLogin, email_list
    email = EmailLogin(mailer or FakeMailer(), b"secret", allowed=email_list(allowed), admins=email_list(admins))
    access = Access(None, "test-secret", email=email, **limits)
    service = CarService(str(tmp_path / "cache.sqlite3"), access, source=FakeKleinanzeigen(), ai_client=FakeClaude())
    return TestClient(create_app(service=service, access=access, jobs=JobManager())), email


def code_of(mail):
    import re
    return re.search(r"\b(\d{6})\b", mail.subject).group(1)


def test_email_login(tmp_path):
    client, email = email_client(tmp_path)
    meta = client.get("/api/meta").json()
    assert meta["auth_required"] is True and meta["login"] == ["email"] and meta["account"] is None
    assert client.post("/api/jobs/analyze", json={"url": AD}).status_code == 401
    assert client.post("/api/auth/email/start", json={"email": "no-at-sign"}).json()["error"]["code"] == "bad_email"

    sent = client.post("/api/auth/email/start", json={"email": " Kha@Example.com ", "language": "de"}).json()
    assert sent == {"sent": True, "email": "kha@example.com", "minutes": 10}
    mail = email.mailer.sent[-1]
    code = code_of(mail)
    assert mail.to == "kha@example.com" and "Anmeldecode" in mail.subject and code in mail.html
    assert f"#/login?email=kha%40example.com&code={code}" in mail.text  # the one-tap link
    again = client.post("/api/auth/email/start", json={"email": "kha@example.com"})
    assert again.status_code == 429 and again.json()["error"]["code"] == "too_soon"

    wrong = client.post("/api/auth/email/verify", json={"email": "kha@example.com", "code": "000000" if code != "000000" else "111111"})
    assert wrong.status_code == 400 and wrong.json()["error"] == {"code": "code_wrong", "left": 4}
    ok = client.post("/api/auth/email/verify", json={"email": "KHA@example.com", "code": code})
    assert ok.json() == {"name": "kha@example.com", "email": "kha@example.com", "admin": False}
    account = client.get("/api/meta").json()["account"]
    assert account["email"] == "kha@example.com" and account["admin"] is False
    assert client.post("/api/jobs/analyze", json={"url": AD}).status_code == 200
    assert client.post("/api/admin/ai-check", json={}).status_code == 403
    # a code works once
    assert client.post("/api/auth/email/verify", json={"email": "kha@example.com", "code": code}).json()["error"]["code"] == "code_expired"


def test_email_login_rules(tmp_path):
    client, email = email_client(tmp_path, allowed="@firma.de,boss@example.com")
    assert client.post("/api/auth/email/start", json={"email": "x@gmail.com"}).status_code == 403
    client.post("/api/auth/email/start", json={"email": "boss@example.com"})
    client.post("/api/auth/email/verify", json={"email": "boss@example.com", "code": code_of(email.mailer.sent[-1])})
    assert client.get("/api/meta").json()["account"]["admin"] is True
    assert client.post("/api/admin/ai-check", json={}).json()["ok"] is True
    client.post("/api/auth/email/start", json={"email": "anna@firma.de"})
    pending = email.mailer.sent[-1]
    for _ in range(5):  # five wrong tries burn the code
        client.post("/api/auth/email/verify", json={"email": "anna@firma.de", "code": "1234"})
    assert client.post("/api/auth/email/verify",
                       json={"email": "anna@firma.de", "code": code_of(pending)}).json()["error"]["code"] == "code_expired"


def test_email_that_cannot_be_sent(tmp_path):
    client, email = email_client(tmp_path, mailer=FakeMailer(fail=True))
    response = client.post("/api/auth/email/start", json={"email": "kha@example.com"})
    assert response.status_code == 503 and response.json()["error"]["code"] == "mail_failed"
    email.mailer.fail = False  # fixed: the user may ask again right away
    assert client.post("/api/auth/email/start", json={"email": "kha@example.com"}).json()["sent"] is True


def test_all_accounts_share_a_daily_ai_cap(tmp_path):
    from cardeal.web.auth import Account
    access = Access(None, "s", ai_daily_limit=5, ai_global_limit=3)
    users = [Account(id=f"u{i}", name=f"u{i}") for i in range(4)]
    assert [access.use(user, "ai") for user in users] == [True, True, True, False]
    assert access.use(Account(id="boss", name="boss", admin=True), "ai") is True


def test_mailer_from_env():
    from cardeal.web.mail import BrevoMailer, SmtpMailer, mailer_from_env
    gmail = mailer_from_env({"GMAIL_USER": "me@gmail.com", "GMAIL_APP_PASSWORD": "abcd efgh ijkl mnop"})
    assert isinstance(gmail, SmtpMailer) and gmail.password == "abcdefghijklmnop" and gmail.port == 465
    assert gmail.sender == "AutoHalle <me@gmail.com>"
    brevo = mailer_from_env({"BREVO_API_KEY": "xkeysib", "MAIL_FROM": "Auto Halle <me@gmail.com>"})
    assert isinstance(brevo, BrevoMailer) and brevo.email == "me@gmail.com" and brevo.name == "Auto Halle"
    assert mailer_from_env({}) is None and mailer_from_env({"BREVO_API_KEY": "x"}) is None


def test_gmail_through_apps_script(monkeypatch):
    from cardeal.web import mail
    calls = []

    def fake_post(url, json, timeout):
        calls.append((url, json))
        ok = json["secret"] == "s3cret"
        return SimpleNamespace(json=lambda: {"ok": True, "remaining": 99} if ok else {"ok": False, "error": "wrong secret"})

    monkeypatch.setattr(mail.requests, "post", fake_post)
    sender = mail.mailer_from_env({"GMAIL_SCRIPT_URL": "https://script.google.com/macros/s/x/exec",
                                   "GMAIL_SCRIPT_SECRET": " s3cret ", "BREVO_API_KEY": "ignored"})
    assert isinstance(sender, mail.AppsScriptMailer)
    sender.send("kha@example.com", "123456 ist dein Code", "text", "<p>html</p>")
    url, payload = calls[-1]
    assert url.endswith("/exec") and payload["to"] == "kha@example.com" and payload["name"] == "AutoHalle"
    sender.secret = "wrong"
    with pytest.raises(mail.MailError, match="wrong secret"):
        sender.send("kha@example.com", "s", "t", "h")
    assert mail.mailer_from_env({"GMAIL_SCRIPT_URL": "https://x"}) is None  # without the secret


def test_running_jobs_can_be_found_again(tmp_path):
    import threading
    access = Access(None, "s")
    jobs = JobManager()
    service = CarService(str(tmp_path / "c.sqlite3"), access, source=FakeKleinanzeigen(), ai_client=FakeClaude())
    client = TestClient(create_app(service=service, access=access, jobs=jobs))
    gate = threading.Event()
    job = jobs.submit("hunt", "public", ["search"], lambda job: gate.wait(5))
    jobs.submit("analyze", "someone-else", [], lambda job: gate.wait(5))
    active = client.get("/api/jobs/active").json()
    assert active == [{"id": job.id, "kind": "hunt", "status": active[0]["status"]}]
    assert active[0]["status"] in ("queued", "running")
    gate.set()
