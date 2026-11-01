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
