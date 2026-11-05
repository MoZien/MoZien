import pytest


@pytest.fixture(autouse=True)
def _server_may_load_pages(monkeypatch):
    """Most tests drive the server's own page loading (fake sources): allow it unless a test sets
    FETCH_MODE itself. In production the default is "device" (see test_device)."""
    monkeypatch.setenv("FETCH_MODE", "both")
