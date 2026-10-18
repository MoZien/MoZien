from cardeal.analyzer import Issue, ListingAnalysis


def make_analysis(**overrides) -> ListingAnalysis:
    data = dict(
        verdict="buy", verdict_reason="solid car", issues=[], positives=[], scam_risk="low", scam_signals=[],
        resale_difficulty="easy", questions_for_seller=[], negotiation_tip="",
    )
    return ListingAnalysis(**{**data, **overrides})


def issue(text="Klima undicht", quote="Klima muss befüllt werden", cost=300, basis="stated") -> Issue:
    return Issue(issue=text, basis=basis, quote=quote, cost_eur=cost)
