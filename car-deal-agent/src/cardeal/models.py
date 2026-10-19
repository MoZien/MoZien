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
    body_type: str | None = None
    # Kleinanzeigen's own filter values from the ad page ("golf", "benzin", "manuell", ...),
    # used to search for exactly the same kind of car as comparables.
    make_slug: str | None = None
    model_slug: str | None = None
    fuel_slug: str | None = None
    gearbox_slug: str | None = None
    body_slug: str | None = None

    @property
    def damaged(self) -> bool:
        """The seller filed the car under "Beschädigtes Fahrzeug"."""
        condition = (self.condition or "").lower()
        return "beschädigt" in condition and "unbeschädigt" not in condition


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
    seller: str | None = None  # "privat" | "gewerblich"
    body_type: str | None = None  # "limousine", "kombi", "kleinwagen", ...
    min_power: int | None = None  # PS
    max_power: int | None = None
    damaged: bool | None = None  # False: only undamaged cars
    pages: int = 2

    @property
    def is_broad(self) -> bool:
        """No model or keyword ("all cars up to 3,000 €"): the results are too
        different to value as one group, so each ad is valued by its own model."""
        return not self.model and not self.query.strip()

    @property
    def segment(self) -> str:
        """Key that groups comparable listings for the market price."""
        model = self.model or self.query.strip().lower() or "*"
        return f"{self.make or '*'}:{model}"


@dataclass
class Comparable:
    """One comparable ad behind a market price, with its asking price adjusted to the
    registration date and mileage of the car being valued."""

    url: str
    title: str
    price: int
    adjusted: int
    km: int
    year: int
    month: int | None
    location: str


@dataclass
class Valuation:
    market_price: int | None
    comparables: int
    spread: float | None
    confidence: str  # "high" | "medium" | "low" | "none"
    method: str
    basis: str = ""  # what was compared, e.g. "Golf · Benzin · Manuell · 104–140 PS · 2012–2016"
    comparables_url: str = ""  # the comparables search on Kleinanzeigen, to check it yourself
    year_effect: float | None = None  # one year newer: +0.08 = +8 %
    km_effect: float | None = None  # 10,000 km more: -0.04 = -4 %
    used: list[Comparable] = field(default_factory=list)
    # The ad's PS value found hardly any car, so it was read as kW (103 -> 140 PS): a guess.
    power_as_kw: bool = False
    # market_price = median of the comparables × local_factor: asking prices around home vs. all
    # of Germany (0.95 = 5 % lower), learned from local_ads ads. None: not applied.
    local_factor: float | None = None
    local_ads: int = 0

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
    hu_cost: int = 0  # part of other_costs: HU/TÜV due soon
    max_buy_price: int = 0  # most you can pay and still make target_profit
    target_profit: int = 0  # deal.min_profit
    fuel_cost: int = 0  # part of other_costs: fetching the car
    trip_km: int = 0  # one way
    trip_legs: int = 0  # 2 = there and back
    # False: the ad has no real price ("VB" only, "1 €"), so buy price and profit are unknown;
    # max_buy_price then says what to offer.
    priced: bool = True
    fuel_price: float = 0.0  # € per litre used for fuel_cost
    consumption: float = 0.0  # l/100 km used for fuel_cost
    resale_factor: float = 0.0  # resale_price = market price × this

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
