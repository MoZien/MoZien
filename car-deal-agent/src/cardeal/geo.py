"""Road distance between German postal codes, from their centre coordinates.

Coordinates: GeoNames (www.geonames.org), CC BY 4.0, shipped in data/de_zip.csv.
"""

from __future__ import annotations

import csv
import logging
import math
import re
from functools import lru_cache
from pathlib import Path

log = logging.getLogger(__name__)

ZIP_FILE = Path(__file__).parent / "data" / "de_zip.csv"
EARTH_RADIUS_KM = 6371.0


@lru_cache(maxsize=1)
def _coordinates() -> dict[str, tuple[float, float]]:
    try:
        with ZIP_FILE.open(encoding="utf-8") as f:
            rows = csv.DictReader(line for line in f if not line.startswith("#"))
            return {row["zip"]: (float(row["lat"]), float(row["lon"])) for row in rows}
    except OSError as exc:
        # Without the table there is no distance, so no fuel cost; the evaluation itself goes on.
        log.warning("postal code table missing (%s), fuel costs are left out", exc)
        return {}


def zip_of(location: str | None) -> str | None:
    """'08529 Sachsen - Plauen' -> '08529'."""
    match = re.match(r"\s*(\d{5})\b", location or "")
    return match.group(1) if match else None


def road_km(from_zip: str | None, to_zip: str | None, road_factor: float = 1.3) -> float | None:
    """Approximate driving distance: straight line between the ZIP centres times `road_factor`."""
    coordinates = _coordinates()
    if from_zip not in coordinates or to_zip not in coordinates:
        return None
    (lat1, lon1), (lat2, lon2) = coordinates[from_zip], coordinates[to_zip]
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((phi2 - phi1) / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a)) * road_factor
