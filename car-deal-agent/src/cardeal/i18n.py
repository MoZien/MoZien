"""User-facing texts in Arabic, German and English (config: `language`)."""

from __future__ import annotations

TEXTS: dict[str, dict[str, str]] = {
    "ar": {
        "verdict_deal": "🔥 لقطة",
        "verdict_check": "🔍 بدها فحص",
        "verdict_skip": "⛔ لا تشتري",
        "price": "السعر",
        "negotiable": "قابل للتفاوض",
        "market": "سعر السوق",
        "below_market": "أرخص من السوق بـ",
        "comparables": "{n} سيارة مشابهة، دقة {confidence}",
        "confidence_high": "عالية",
        "confidence_medium": "متوسطة",
        "confidence_low": "ضعيفة",
        "profit": "الربح المتوقع",
        "calc": "شراء ~{buy} + إصلاح {repairs} + مصاريف {other}{vat} ← بيع ~{resale}",
        "vat": " + ضريبة الهامش {vat}",
        "seller_dealer": "تاجر",
        "seller_private": "بيع خاص",
        "hu": "الفحص (TÜV) لغاية",
        "ai": "تحليل الذكاء الاصطناعي",
        "red_flags": "نقاط الخطر",
        "positives": "إيجابيات",
        "questions": "اسأل البائع",
        "negotiation": "نصيحة للتفاوض",
        "scam_risk": "خطر احتيال",
        "risk_low": "منخفض",
        "risk_medium": "متوسط",
        "risk_high": "عالي",
        "reasons": "ليش",
        "reason_profit_low": "الربح {profit} € أقل من الحد الأدنى {minimum} €",
        "reason_roi_low": "العائد {roi} أقل من الحد الأدنى {minimum}",
        "reason_few_comparables": "سعر السوق محسوب من {n} سيارات بس",
        "reason_suspicious": "أرخص من السوق بـ {discount}: لازم تعرف السبب (عطل؟ احتيال؟)",
        "reason_hu_due": "الفحص (TÜV) قرّب: {hu}",
        "reason_scam": "خطر احتيال عالي",
        "reason_ai": "الذكاء الاصطناعي: {reason}",
    },
    "de": {
        "verdict_deal": "🔥 Schnäppchen",
        "verdict_check": "🔍 Prüfen",
        "verdict_skip": "⛔ Finger weg",
        "price": "Preis",
        "negotiable": "VB",
        "market": "Marktpreis",
        "below_market": "unter Markt",
        "comparables": "{n} Vergleichsautos, Sicherheit {confidence}",
        "confidence_high": "hoch",
        "confidence_medium": "mittel",
        "confidence_low": "gering",
        "profit": "Erwarteter Gewinn",
        "calc": "Kauf ~{buy} + Reparatur {repairs} + Kosten {other}{vat} → Verkauf ~{resale}",
        "vat": " + Margensteuer {vat}",
        "seller_dealer": "Händler",
        "seller_private": "Privat",
        "hu": "HU bis",
        "ai": "KI-Analyse",
        "red_flags": "Risiken",
        "positives": "Pluspunkte",
        "questions": "Fragen an den Verkäufer",
        "negotiation": "Verhandlungstipp",
        "scam_risk": "Betrugsrisiko",
        "risk_low": "niedrig",
        "risk_medium": "mittel",
        "risk_high": "hoch",
        "reasons": "Gründe",
        "reason_profit_low": "Gewinn {profit} € unter Minimum {minimum} €",
        "reason_roi_low": "Rendite {roi} unter Minimum {minimum}",
        "reason_few_comparables": "Marktpreis aus nur {n} Vergleichsautos",
        "reason_suspicious": "{discount} unter Markt: Grund klären (Schaden? Betrug?)",
        "reason_hu_due": "HU fällig {hu}",
        "reason_scam": "hohes Betrugsrisiko",
        "reason_ai": "KI: {reason}",
    },
    "en": {
        "verdict_deal": "🔥 Deal",
        "verdict_check": "🔍 Check it",
        "verdict_skip": "⛔ Skip",
        "price": "Price",
        "negotiable": "negotiable",
        "market": "Market price",
        "below_market": "below market",
        "comparables": "{n} comparables, confidence {confidence}",
        "confidence_high": "high",
        "confidence_medium": "medium",
        "confidence_low": "low",
        "profit": "Expected profit",
        "calc": "buy ~{buy} + repairs {repairs} + costs {other}{vat} → sell ~{resale}",
        "vat": " + margin VAT {vat}",
        "seller_dealer": "dealer",
        "seller_private": "private",
        "hu": "Inspection (HU) until",
        "ai": "AI review",
        "red_flags": "Red flags",
        "positives": "Positives",
        "questions": "Ask the seller",
        "negotiation": "Negotiation tip",
        "scam_risk": "Scam risk",
        "risk_low": "low",
        "risk_medium": "medium",
        "risk_high": "high",
        "reasons": "Why",
        "reason_profit_low": "profit {profit} € below minimum {minimum} €",
        "reason_roi_low": "ROI {roi} below minimum {minimum}",
        "reason_few_comparables": "market price based on only {n} comparables",
        "reason_suspicious": "{discount} below market: find out why (damage? scam?)",
        "reason_hu_due": "HU due {hu}",
        "reason_scam": "high scam risk",
        "reason_ai": "AI: {reason}",
    },
}

LANGUAGE_NAMES = {"ar": "Arabic", "de": "German", "en": "English"}


def t(lang: str, key: str, **params) -> str:
    texts = TEXTS.get(lang, TEXTS["en"])
    return texts.get(key, TEXTS["en"][key]).format(**params)


def euro(amount: int | float | None) -> str:
    """German number format: 12500 -> '12.500 €'."""
    if amount is None:
        return "?"
    return f"{round(amount):,} €".replace(",", ".")


def percent(value: float) -> str:
    return f"{value * 100:.0f} %"
