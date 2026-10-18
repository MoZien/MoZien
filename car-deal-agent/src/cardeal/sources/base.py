"""Interface every marketplace adapter implements (Kleinanzeigen today, mobile.de later)."""

from __future__ import annotations

from typing import Protocol

from cardeal.models import Listing, SearchCriteria


class SourceBlockedError(RuntimeError):
    """The marketplace refused the request (rate limit, captcha, IP block)."""


class ListingSource(Protocol):
    name: str

    def search(self, criteria: SearchCriteria, price_ceiling: int | None = None) -> list[Listing]:
        """Return listings for the criteria. `price_ceiling` overrides the budget so
        the search also collects pricier cars as market data."""
        ...

    def fetch_details(self, listing: Listing) -> Listing:
        """Load the full ad (description, HU, seller type, ...)."""
        ...
