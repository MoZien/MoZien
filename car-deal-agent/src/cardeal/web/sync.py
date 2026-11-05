"""Saved cars, garage and saved searches of an account, kept on the server so that every device
the account signs in on has them.

Every item is stored on its own with the time it last changed. A deleted item leaves a deletion
note (no content) for a while, so the deletion reaches the other devices too. A device and the
server compare what they have (id -> last change) and swap only what is newer on either side; the
latest change wins. If the server ever loses its data (a fresh disk), devices simply send theirs
again on the next comparison.
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

# What is synced, with the most live items an account may keep in each.
COLLECTIONS = {"saved": 400, "garage": 300, "searches": 100}
MAX_ITEM_CHARS = 400_000
MAX_ID_CHARS = 200
TOMBSTONE_DAYS = 180
TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$")

SCHEMA = """
CREATE TABLE IF NOT EXISTS sync_items (
    account TEXT NOT NULL,
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    updated TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    data TEXT,
    PRIMARY KEY (account, collection, id)
);
"""


class SyncError(ValueError):
    """A malformed item (bad id, timestamp or size)."""


class SyncStore:
    def __init__(self, path: str | Path):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.executescript(SCHEMA)
        self._pruned = ""

    def reconcile(self, account: str, collection: str, manifest: dict[str, str]) -> dict[str, Any]:
        """`manifest`: what the device has, id -> last change (its deletions included). Returns the
        ids the server needs from the device and the items the device should take."""
        self._prune_daily()
        with self._lock:
            rows = self.db.execute(
                "SELECT id, updated, deleted, data FROM sync_items WHERE account = ? AND collection = ?",
                (account, collection),
            ).fetchall()
        server = {row[0]: row for row in rows}
        need = [item_id for item_id, updated in manifest.items()
                if item_id not in server or updated > server[item_id][1]]
        give = [
            {"id": item_id, "updated": updated, "deleted": bool(deleted),
             "data": None if deleted or data is None else json.loads(data)}
            for item_id, updated, deleted, data in rows
            if item_id not in manifest or updated > manifest[item_id]
        ]
        return {"need": need, "items": give}

    def put(self, account: str, collection: str, items: list[dict[str, Any]]) -> dict[str, Any]:
        """Stores the items that are newer than the server's copy. Returns how many were stored and
        whether the collection is full (items beyond the limit are not stored)."""
        limit = COLLECTIONS[collection]
        stored, full = 0, False
        with self._lock:
            for item in items:
                item_id, updated, deleted = _check(item)
                row = self.db.execute(
                    "SELECT updated, deleted FROM sync_items WHERE account = ? AND collection = ? AND id = ?",
                    (account, collection, item_id),
                ).fetchone()
                if row and row[0] >= updated:
                    continue  # the server's copy is as new or newer
                if not deleted and (row is None or row[1]):
                    live = self.db.execute(
                        "SELECT COUNT(*) FROM sync_items WHERE account = ? AND collection = ? AND deleted = 0",
                        (account, collection),
                    ).fetchone()[0]
                    if live >= limit:
                        full = True
                        continue
                data = None if deleted else json.dumps(item.get("data"), ensure_ascii=False)
                self.db.execute(
                    "INSERT INTO sync_items (account, collection, id, updated, deleted, data) VALUES (?, ?, ?, ?, ?, ?) "
                    "ON CONFLICT (account, collection, id) DO UPDATE SET "
                    "updated = excluded.updated, deleted = excluded.deleted, data = excluded.data",
                    (account, collection, item_id, updated, int(deleted), data),
                )
                stored += 1
            self.db.commit()
        return {"stored": stored, "full": full}

    def erase(self, account: str) -> None:
        """Account deleted: everything it kept here goes."""
        with self._lock:
            self.db.execute("DELETE FROM sync_items WHERE account = ?", (account,))
            self.db.commit()

    def prune(self, before: datetime) -> int:
        """Forgets deletion notes older than `before` (every device has long had them)."""
        cutoff = before.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        with self._lock:
            gone = self.db.execute("DELETE FROM sync_items WHERE deleted = 1 AND updated < ?", (cutoff,)).rowcount
            self.db.commit()
        return gone

    def _prune_daily(self) -> None:
        today = datetime.now(timezone.utc).date().isoformat()
        if self._pruned != today:
            self._pruned = today
            self.prune(datetime.now(timezone.utc) - timedelta(days=TOMBSTONE_DAYS))


def _check(item: dict[str, Any]) -> tuple[str, str, bool]:
    item_id, updated = item.get("id"), item.get("updated")
    if not isinstance(item_id, str) or not 0 < len(item_id) <= MAX_ID_CHARS:
        raise SyncError("bad id")
    if not isinstance(updated, str) or not TIMESTAMP.match(updated):
        raise SyncError("bad timestamp")
    deleted = bool(item.get("deleted"))
    if not deleted:
        data = item.get("data")
        if not isinstance(data, dict) or data.get("id") != item_id:
            raise SyncError("bad data")
        if len(json.dumps(data, ensure_ascii=False)) > MAX_ITEM_CHARS:
            raise SyncError("too big")
    return item_id, updated, deleted
