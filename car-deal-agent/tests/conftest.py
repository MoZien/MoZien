import pytest


@pytest.fixture(autouse=True)
def _server_may_load_pages(monkeypatch, tmp_path):
    """Most tests drive the server's own page loading (fake sources): allow it unless a test sets
    FETCH_MODE itself. In production the default is "device" (see test_device). Synced data goes
    to a fresh file per test. The ad photos of the fake ads are never downloaded: a service gets no
    photos in server mode unless the test gives it a photo loader."""
    from cardeal.web import service

    monkeypatch.setenv("FETCH_MODE", "both")
    monkeypatch.setenv("SYNC_DB", str(tmp_path / "sync.sqlite3"))
    monkeypatch.setattr(service, "load_on_server", lambda urls: [])
