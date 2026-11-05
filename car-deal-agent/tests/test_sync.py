"""Saved cars, garage and searches reach every device of an account; the latest change wins."""

from datetime import datetime, timezone

import pytest
from test_web import code_of, email_client, make_client

from cardeal.web.sync import SyncError, SyncStore

T1, T2, T3 = "2026-11-01T10:00:00.000Z", "2026-11-02T10:00:00.000Z", "2026-11-03T10:00:00.000Z"


def car(car_id, note=""):
    return {"id": car_id, "notes": note, "favorite": False}


def test_two_devices_swap_only_what_is_newer():
    store = SyncStore(":memory:")
    # phone A sends two cars
    assert store.reconcile("acc", "saved", {"a": T1, "b": T1})["need"] == ["a", "b"]
    store.put("acc", "saved", [{"id": "a", "updated": T1, "data": car("a")}, {"id": "b", "updated": T1, "data": car("b")}])
    # phone B has an older "a" and a car of its own
    answer = store.reconcile("acc", "saved", {"a": "2026-10-01T00:00:00.000Z", "c": T2})
    assert answer["need"] == ["c"]
    assert sorted(item["id"] for item in answer["items"]) == ["a", "b"]
    store.put("acc", "saved", [{"id": "c", "updated": T2, "data": car("c")}])
    # B deletes "b"; A learns about it, without content
    store.put("acc", "saved", [{"id": "b", "updated": T3, "deleted": True}])
    answer = store.reconcile("acc", "saved", {"a": T1, "b": T1})
    by_id = {item["id"]: item for item in answer["items"]}
    assert by_id["b"] == {"id": "b", "updated": T3, "deleted": True, "data": None} and "c" in by_id
    # other accounts see nothing
    assert store.reconcile("other", "saved", {}) == {"need": [], "items": []}


def test_the_latest_change_wins():
    store = SyncStore(":memory:")
    store.put("acc", "garage", [{"id": "g", "updated": T2, "data": car("g", "new")}])
    assert store.put("acc", "garage", [{"id": "g", "updated": T1, "data": car("g", "old")}])["stored"] == 0
    assert store.reconcile("acc", "garage", {})["items"][0]["data"]["notes"] == "new"
    assert store.put("acc", "garage", [{"id": "g", "updated": T3, "data": car("g", "newest")}])["stored"] == 1
    assert store.reconcile("acc", "garage", {})["items"][0]["data"]["notes"] == "newest"


def test_limits_and_bad_items(monkeypatch):
    from cardeal.web import sync as sync_module
    monkeypatch.setitem(sync_module.COLLECTIONS, "searches", 2)
    store = SyncStore(":memory:")
    answer = store.put("acc", "searches", [{"id": str(i), "updated": T1, "data": car(str(i))} for i in range(3)])
    assert answer == {"stored": 2, "full": True}
    for bad in ({"id": "", "updated": T1, "data": car("")}, {"id": "x", "updated": "yesterday", "data": car("x")},
                {"id": "x", "updated": T1, "data": car("y")}, {"id": "x", "updated": T1, "data": "text"}):
        with pytest.raises(SyncError):
            store.put("acc", "saved", [bad])


def test_old_deletion_notes_are_forgotten_and_erase_removes_everything():
    store = SyncStore(":memory:")
    store.put("acc", "saved", [{"id": "old", "updated": "2026-01-01T00:00:00.000Z", "deleted": True},
                               {"id": "live", "updated": T1, "data": car("live")}])
    assert store.prune(datetime(2026, 6, 1, tzinfo=timezone.utc)) == 1
    assert [item["id"] for item in store.reconcile("acc", "saved", {})["items"]] == ["live"]
    store.erase("acc")
    assert store.reconcile("acc", "saved", {})["items"] == []


def signed_in(tmp_path, email="kha@example.com"):
    client, login = email_client(tmp_path)
    client.post("/api/auth/email/start", json={"email": email})
    client.post("/api/auth/email/verify", json={"email": email, "code": code_of(login.mailer.sent[-1])})
    return client


def test_sync_api_for_a_signed_in_account(tmp_path):
    client = signed_in(tmp_path)
    assert client.post("/api/sync/saved/reconcile", json={"manifest": {"a": T1}}).json() == {"need": ["a"], "items": []}
    assert client.post("/api/sync/saved", json={"items": [{"id": "a", "updated": T1, "data": car("a")}]}).json() == {
        "stored": 1, "full": False}
    assert client.post("/api/sync/saved/reconcile", json={"manifest": {}}).json()["items"][0]["id"] == "a"
    assert client.post("/api/sync/passwords/reconcile", json={"manifest": {}}).status_code == 404
    bad = client.post("/api/sync/saved", json={"items": [{"id": "a", "updated": "now", "data": car("a")}]})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "bad_sync"
    # deleting the account deletes its synced data
    client.post("/api/account/delete")
    again = signed_in(tmp_path)
    assert again.post("/api/sync/saved/reconcile", json={"manifest": {}}).json()["items"] == []


def test_no_sync_without_accounts(tmp_path):
    client, _ = make_client(tmp_path=tmp_path)  # open mode: everybody is "public"
    assert client.post("/api/sync/saved/reconcile", json={"manifest": {}}).status_code == 404
