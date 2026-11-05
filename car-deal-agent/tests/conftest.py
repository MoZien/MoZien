import pytest


@pytest.fixture(autouse=True)
def _server_may_load_pages(monkeypatch, tmp_path):
    """Most tests drive the server's own page loading (fake sources): allow it unless a test sets
    FETCH_MODE itself. In production the default is "device" (see test_device). Synced data goes
    to a fresh file per test."""
    monkeypatch.setenv("FETCH_MODE", "both")
    monkeypatch.setenv("SYNC_DB", str(tmp_path / "sync.sqlite3"))
