from datetime import datetime, timedelta

from cardeal.models import Listing
from cardeal.storage import Store


def ad(ad_id: str) -> Listing:
    return Listing(id=ad_id, source="kleinanzeigen", url=f"https://k/{ad_id}", title="VW Golf", price=5_000,
                   year=2014, km=100_000, location="06108 Halle")


def test_prune_deletes_ads_older_than_the_lookback():
    store = Store(":memory:")
    now = datetime(2026, 11, 2, 12, 0)
    store.upsert(ad("old"), "volkswagen:golf", now - timedelta(days=70))
    store.upsert(ad("new"), "volkswagen:golf", now - timedelta(days=5))
    store.add_to_set("search-url", ["old", "new"])
    store.mark_comparables_fetched("search-url", now - timedelta(days=70))

    assert store.prune(now - timedelta(days=60)) == 1
    assert [car.id for car in store.comparable_set("search-url", now - timedelta(days=365))] == ["new"]
    assert store.comparables_fetched_at("search-url") is None  # fetched again next time
    assert store.db.execute("SELECT COUNT(*) FROM comparable_sets").fetchone()[0] == 1
