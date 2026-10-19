"""SQLite store: every seen listing (market data) plus what was already evaluated."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from cardeal.models import DealReport, Listing

SCHEMA = """
CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    segment TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    price INTEGER,
    negotiable INTEGER NOT NULL DEFAULT 0,
    km INTEGER,
    year INTEGER,
    month INTEGER,
    location TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    evaluated_price INTEGER
);
CREATE INDEX IF NOT EXISTS listings_segment ON listings (segment, last_seen);

CREATE TABLE IF NOT EXISTS comparable_sets (
    key TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    PRIMARY KEY (key, listing_id)
);

CREATE TABLE IF NOT EXISTS comparables_fetched (
    key TEXT PRIMARY KEY,
    fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
    listing_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    verdict TEXT NOT NULL,
    profit INTEGER NOT NULL,
    report_json TEXT NOT NULL
);
"""


class Store:
    def __init__(self, path: str | Path):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path))
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)

    def upsert(self, listing: Listing, segment: str, now: datetime) -> None:
        self.db.execute(
            """
            INSERT INTO listings (id, source, segment, url, title, price, negotiable, km, year, month,
                                  location, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                -- a broad search ("opel:*") must not undo a known model ("opel:corsa")
                segment = CASE WHEN excluded.segment LIKE '%:*' THEN listings.segment ELSE excluded.segment END,
                title = excluded.title, price = excluded.price, negotiable = excluded.negotiable,
                km = excluded.km, year = excluded.year, month = excluded.month,
                location = excluded.location, last_seen = excluded.last_seen
            """,
            (
                listing.id, listing.source, segment, listing.url, listing.title, listing.price,
                int(listing.negotiable), listing.km, listing.year, listing.month, listing.location,
                now.isoformat(), now.isoformat(),
            ),
        )
        self.db.commit()

    def comparables_fetched_at(self, key: str) -> datetime | None:
        row = self.db.execute("SELECT fetched_at FROM comparables_fetched WHERE key = ?", (key,)).fetchone()
        return datetime.fromisoformat(row["fetched_at"]) if row else None

    def mark_comparables_fetched(self, key: str, now: datetime) -> None:
        self.db.execute(
            "INSERT INTO comparables_fetched (key, fetched_at) VALUES (?, ?) "
            "ON CONFLICT (key) DO UPDATE SET fetched_at = excluded.fetched_at",
            (key, now.isoformat()),
        )
        self.db.commit()

    def has_segment(self, segment: str) -> bool:
        return self.db.execute("SELECT 1 FROM listings WHERE segment = ? LIMIT 1", (segment,)).fetchone() is not None

    def add_to_set(self, key: str, listing_ids: list[str]) -> None:
        """Remembers which ads a comparables search (key = its URL) returned."""
        self.db.executemany(
            "INSERT OR IGNORE INTO comparable_sets (key, listing_id) VALUES (?, ?)",
            [(key, listing_id) for listing_id in listing_ids],
        )
        self.db.commit()

    def comparable_set(self, key: str, since: datetime) -> list[Listing]:
        rows = self.db.execute(
            "SELECT l.* FROM listings l JOIN comparable_sets c ON c.listing_id = l.id "
            "WHERE c.key = ? AND l.last_seen >= ?",
            (key, since.isoformat()),
        )
        return self._listings(rows)

    def comparable_groups(self, since: datetime) -> list[list[Listing]]:
        """Every stored comparables search with its ads seen since `since` (for the regional price level)."""
        rows = self.db.execute(
            "SELECT c.key AS set_key, l.* FROM comparable_sets c JOIN listings l ON l.id = c.listing_id "
            "WHERE l.last_seen >= ? ORDER BY c.key",
            (since.isoformat(),),
        ).fetchall()
        groups: dict[str, list[Listing]] = {}
        for row in rows:
            groups.setdefault(row["set_key"], []).extend(self._listings([row]))
        return list(groups.values())

    def comparables(self, segment: str, since: datetime) -> list[Listing]:
        rows = self.db.execute(
            "SELECT * FROM listings WHERE segment = ? AND last_seen >= ?",
            (segment, since.isoformat()),
        )
        return self._listings(rows)

    @staticmethod
    def _listings(rows) -> list[Listing]:
        return [
            Listing(
                id=r["id"], source=r["source"], url=r["url"], title=r["title"], price=r["price"],
                negotiable=bool(r["negotiable"]), km=r["km"], year=r["year"], month=r["month"],
                location=r["location"] or "",
            )
            for r in rows
        ]

    def needs_evaluation(self, listing: Listing) -> bool:
        """New listings and price drops get evaluated; everything else was seen already."""
        row = self.db.execute("SELECT evaluated_price FROM listings WHERE id = ?", (listing.id,)).fetchone()
        if row is None or row["evaluated_price"] is None:
            return True
        return listing.price is not None and listing.price < row["evaluated_price"]

    def mark_evaluated(self, listing: Listing) -> None:
        self.db.execute("UPDATE listings SET evaluated_price = ? WHERE id = ?", (listing.price, listing.id))
        self.db.commit()

    def save_report(self, report: DealReport, now: datetime) -> None:
        data = asdict(report)
        if report.analysis is not None:
            data["analysis"] = report.analysis.model_dump()
        self.db.execute(
            "INSERT INTO reports (listing_id, created_at, verdict, profit, report_json) VALUES (?, ?, ?, ?, ?)",
            (report.listing.id, now.isoformat(), report.verdict, report.flip.profit,
             json.dumps(data, ensure_ascii=False)),
        )
        self.db.commit()

    def recent_reports(self, limit: int = 10, verdicts: tuple[str, ...] = ("deal", "check")) -> list[dict]:
        placeholders = ",".join("?" for _ in verdicts)
        rows = self.db.execute(
            f"SELECT report_json FROM reports WHERE verdict IN ({placeholders}) "
            "ORDER BY created_at DESC LIMIT ?",
            (*verdicts, limit),
        )
        return [json.loads(r["report_json"]) for r in rows]

    def close(self) -> None:
        self.db.close()
