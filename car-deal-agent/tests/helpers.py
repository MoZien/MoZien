from cardeal.analyzer import ListingAnalysis


def make_analysis(**overrides) -> ListingAnalysis:
    data = dict(
        summary="ok", condition="good", red_flags=[], positives=[], estimated_repair_cost_eur=0,
        scam_risk="low", scam_signals=[], resale_difficulty="easy", questions_for_seller=[],
        negotiation_tip="", verdict="buy", verdict_reason="solid car",
    )
    return ListingAnalysis(**{**data, **overrides})
