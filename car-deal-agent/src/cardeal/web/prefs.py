"""What a user set in the app's settings. The browser keeps them and sends them with every request,
so the server holds no user data; here they become the settings the valuation code uses."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from cardeal.config import (
    AISettings,
    AppConfig,
    DealSettings,
    FilterSettings,
    ScraperSettings,
    TripSettings,
    ValuationSettings,
)
from cardeal.models import SearchCriteria
from cardeal.personal import PersonalSettings

Purpose = Literal["personal", "trade"]


class Prefs(BaseModel):
    language: Literal["ar", "de", "en"] = "ar"
    purpose: Purpose = "trade"
    home_zip: str = Field("06108", pattern=r"^\d{5}$")

    # Trade: buying to resell
    min_profit: int = Field(500, ge=0, le=100_000)
    min_roi: float = Field(0.15, ge=0, le=5)
    min_discount: float = Field(0.12, ge=0, le=0.9)
    negotiation_discount: float = Field(0.05, ge=0, le=0.5)
    resale_factor: float = Field(0.95, ge=0.5, le=1.2)
    fixed_costs: int = Field(0, ge=0, le=20_000)
    hu_cost: int = Field(150, ge=0, le=5_000)
    hu_warning_months: int = Field(2, ge=0, le=24)
    vat_margin_scheme: bool = False
    suspicious_discount: float = Field(0.40, ge=0.1, le=0.95)

    # Fetching the car
    consumption: float = Field(7.5, ge=1, le=30)
    petrol_price: float = Field(2.10, ge=0.5, le=5)
    diesel_price: float = Field(2.20, ge=0.5, le=5)
    lpg_price: float = Field(1.10, ge=0.3, le=5)
    electricity_price: float = Field(0.35, ge=0.05, le=2)
    round_trip: bool = True
    road_factor: float = Field(1.3, ge=1, le=2)

    # Personal: buying to keep
    annual_km: int = Field(12_000, ge=0, le=200_000)
    usage: Literal["city", "mixed", "highway"] = "mixed"
    max_budget: int | None = Field(None, ge=0, le=1_000_000)
    inspection_cost: int = Field(120, ge=0, le=2_000)

    # Market price
    year_window: int = Field(2, ge=1, le=4)
    km_window: float = Field(0.4, ge=0.1, le=1.0)
    min_comparables: int = Field(5, ge=3, le=20)
    comparables_pages: int = Field(2, ge=1, le=3)
    comparables_seller: Literal["privat", "gewerblich", "all"] = "privat"
    local_radius_km: int = Field(150, ge=0, le=500)

    # AI review
    ai_enabled: bool = True
    ai_effort: Literal["low", "medium", "high"] = "medium"
    ai_in_hunt: bool = True

    def config(self, ai_model: str, searches: list[SearchCriteria] | None = None) -> AppConfig:
        return AppConfig(
            searches=searches or [SearchCriteria(name="app")],
            language=self.language,
            valuation=ValuationSettings(
                year_window=self.year_window, km_window=self.km_window, min_comparables=self.min_comparables,
                comparables_pages=self.comparables_pages, local_radius_km=self.local_radius_km,
                comparables_seller=None if self.comparables_seller == "all" else self.comparables_seller,
            ),
            deal=DealSettings(
                min_discount=self.min_discount, min_profit=self.min_profit, min_roi=self.min_roi,
                negotiation_discount=self.negotiation_discount, resale_factor=self.resale_factor,
                fixed_costs={"fixed": self.fixed_costs} if self.fixed_costs else {}, hu_cost=self.hu_cost,
                hu_warning_months=self.hu_warning_months, vat_margin_scheme=self.vat_margin_scheme,
                suspicious_discount=self.suspicious_discount,
            ),
            trip=TripSettings(
                home_zip=self.home_zip, consumption_l_per_100km=self.consumption,
                fuel_prices={"benzin": self.petrol_price, "diesel": self.diesel_price},
                round_trip=self.round_trip, road_factor=self.road_factor,
            ),
            ai=AISettings(enabled=self.ai_enabled, model=ai_model, effort=self.ai_effort),
            scraper=ScraperSettings(),
            filters=FilterSettings(),
        )

    def personal(self) -> PersonalSettings:
        return PersonalSettings(
            annual_km=self.annual_km, usage=self.usage, max_budget=self.max_budget, petrol_price=self.petrol_price,
            diesel_price=self.diesel_price, lpg_price=self.lpg_price, electricity_price=self.electricity_price,
            inspection_cost=self.inspection_cost,
        )

    def buyer(self) -> str:
        """The buyer's situation in words, for the personal AI review."""
        use = {"city": "mostly city", "mixed": "mixed city and country roads", "highway": "mostly motorway"}
        text = f"drives about {self.annual_km:,} km a year, {use[self.usage]}".replace(",", ".")
        if self.max_budget:
            text += f", budget up to {self.max_budget} €"
        return text


class HuntCriteria(BaseModel):
    """A search on Kleinanzeigen, as the hunt form sends it."""

    max_price: int | None = Field(3000, ge=0, le=1_000_000)
    min_price: int | None = Field(500, ge=0, le=1_000_000)
    min_year: int | None = Field(2002, ge=1950, le=2100)
    max_year: int | None = Field(None, ge=1950, le=2100)
    min_km: int | None = Field(None, ge=0)
    max_km: int | None = Field(200_000, ge=0)
    zip_code: str | None = Field("06108", pattern=r"^\d{5}$")
    radius_km: int | None = Field(200, ge=5, le=500)
    seller: Literal["privat", "gewerblich", "all"] = "privat"
    make: str | None = Field(None, pattern=r"^[a-z0-9_]+$")
    query: str = Field("", max_length=60)
    fuel: str | None = Field(None, pattern=r"^[a-z]+$")
    gearbox: Literal["manuell", "automatik"] | None = None
    body_type: str | None = Field(None, pattern=r"^[a-z_]+$")
    exclude_places: list[str] = Field(default_factory=list, max_length=20)
    count: int = Field(3, ge=1, le=10)
    max_ads: int = Field(15, ge=1, le=40)
    pages: int = Field(2, ge=1, le=4)
    skip_ids: list[str] = Field(default_factory=list, max_length=2000)  # ads this user has already seen

    def search(self) -> SearchCriteria:
        return SearchCriteria(
            name="hunt", make=self.make, query=self.query.strip(), min_price=self.min_price,
            max_price=self.max_price, min_year=self.min_year, max_year=self.max_year, min_km=self.min_km,
            max_km=self.max_km, fuel=self.fuel, gearbox=self.gearbox, zip_code=self.zip_code,
            radius_km=self.radius_km, seller=None if self.seller == "all" else self.seller,
            body_type=self.body_type, pages=self.pages,
        )


class ManualCar(BaseModel):
    """A car typed in by hand, to value without an ad."""

    make: str = Field(pattern=r"^[a-z0-9_]+$")
    model: str = Field(min_length=1, max_length=40)
    year: int = Field(ge=1950, le=2100)
    month: int | None = Field(None, ge=1, le=12)
    km: int = Field(ge=0, le=1_000_000)
    power_ps: int | None = Field(None, ge=10, le=2_000)
    fuel: str | None = Field(None, pattern=r"^[a-z]+$")
    gearbox: Literal["manuell", "automatik"] | None = None
    body_type: str | None = Field(None, pattern=r"^[a-z_]+$")
    price: int | None = Field(None, ge=0, le=1_000_000)
    negotiable: bool = True
    zip_code: str | None = Field(None, pattern=r"^\d{5}$")
    hu_until: str | None = Field(None, pattern=r"^\d{2}/\d{4}$")
