"""Domain objects shared by all modules."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from cardeal.analyzer import ListingAnalysis


@dataclass
class Listing:
    """One car ad. Search pages fill the basics, the detail page fills the rest."""

    id: str
    source: str
    url: str
    title: str
    price: int | None
    negotiable: bool = False
    km: int | None = None
    year: int | None = None
    month: int | None = None
    location: str = ""
    description: str = ""
    make: str | None = None
    model: str | None = None
    fuel: str | None = None
    gearbox: str | None = None
    power_ps: int | None = None
    condition: str | None = None
    hu_until: str | None = None
    seller_type: str | None = None
    features: list[str] = field(default_factory=list)
    details_loaded: bool = False


@dataclass
class SearchCriteria:
    """What the user is hunting for. Slugs follow Kleinanzeigen's URL filters."""

    name: str
    make: str | None = None
    model: str | None = None
    query: str = ""
    min_price: int | None = None
    max_price: int | None = None
    min_year: int | None = None
    max_year: int | None = None
    min_km: int | None = None
    max_km: int | None = None
    fuel: str | None = None
    gearbox: str | None = None
    zip_code: str | None = None
    radius_km: int | None = None
    pages: int = 2

    @property
    def segment(self) -> str:
        """Key that groups comparable listings for the market price."""
        model = self.model or self.query.strip().lower() or "*"
        return f"{self.make or '*'}:{model}"


@dataclass
class Valuation:
    market_price: int | None
    comparables: int
    spread: float | None
    confidence: str  # "high" | "medium" | "low" | "none"
    method: str

    def discount(self, price: int | None) -> float | None:
        """How far below the market price an asking price is (0.2 = 20 % cheaper)."""
        if not self.market_price or price is None:
            return None
        return (self.market_price - price) / self.market_price


@dataclass
class FlipEstimate:
    buy_price: int
    resale_price: int
    repair_costs: int
    other_costs: int
    vat: int
    profit: int
    roi: float

    @property
    def total_costs(self) -> int:
        return self.repair_costs + self.other_costs + self.vat


@dataclass
class DealReport:
    listing: Listing
    valuation: Valuation
    flip: FlipEstimate
    verdict: str  # "deal" | "check" | "skip"
    reasons: list[str] = field(default_factory=list)
    analysis: ListingAnalysis | None = None
    search_name: str = ""
