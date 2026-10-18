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
        "above_market": "أغلى من السوق بـ",
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
        "chat_started": "✅ البوت شغّال وعم يراقب السوق. ابعتلي رابط أي إعلان سيارة من Kleinanzeigen وبقلّك إذا بتستاهل.",
        "chat_started_links": "✅ البوت شغّال. ابعتلي رابط أي إعلان سيارة من Kleinanzeigen وبقلّك إذا بتستاهل.",
        "chat_help": "ابعتلي رابط إعلان سيارة من Kleinanzeigen (بالتطبيق: مشاركة ← نسخ الرابط) "
                     "وبحسبلك سعر السوق والربح والمخاطر.",
        "chat_working": "⏳ عم حلّل الإعلان، بياخد دقيقة أو دقيقتين…",
        "chat_not_car": "ما قدرت اقرأ الماركة والموديل وسنة الصنع من هالإعلان. متأكد إنه إعلان سيارة؟",
        "chat_few_comps": "لقيت بس {n} سيارات مشابهة، وهاد قليل لحتى احسب سعر السوق.",
        "chat_blocked": "Kleinanzeigen عم يرفض الطلبات هلق. جرّب كمان شوي.",
        "chat_gone": "هالإعلان ما عاد موجود (انباع أو انحذف).",
        "chat_error": "صار خطأ أثناء التحليل: {error}",
        "chat_private": "🔒 هالبوت خاص. اطلب من صاحبه يسمحلك تستخدمه.",
        "chat_stranger": "👤 {name} بعت رسالة للبوت وما جاوبته.\n"
                         "إذا بدك تسمحله يبعت روابط، ضيف هالسطر لملف ‎.env وأعد تشغيل البوت:\n"
                         "<code>TELEGRAM_ALLOWED_CHATS={id}</code>\n"
                         "(إذا في أكتر من شخص، افصل الأرقام بفاصلة)",
    },
    "de": {
        "verdict_deal": "🔥 Schnäppchen",
        "verdict_check": "🔍 Prüfen",
        "verdict_skip": "⛔ Finger weg",
        "price": "Preis",
        "negotiable": "VB",
        "market": "Marktpreis",
        "below_market": "unter Markt",
        "above_market": "über Markt",
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
        "chat_started": "✅ Der Bot läuft und beobachtet den Markt. Schick mir einen Link zu einer "
                        "Kleinanzeigen-Autoanzeige und ich sag dir, ob sie sich lohnt.",
        "chat_started_links": "✅ Der Bot läuft. Schick mir einen Link zu einer Kleinanzeigen-Autoanzeige "
                              "und ich sag dir, ob sie sich lohnt.",
        "chat_help": "Schick mir den Link zu einer Autoanzeige auf Kleinanzeigen (in der App: Teilen → Link kopieren), "
                     "dann berechne ich Marktpreis, Gewinn und Risiken.",
        "chat_working": "⏳ Ich analysiere die Anzeige, das dauert ein bis zwei Minuten…",
        "chat_not_car": "Ich konnte Marke, Modell und Erstzulassung nicht lesen. Ist das eine Autoanzeige?",
        "chat_few_comps": "Nur {n} Vergleichsautos gefunden, zu wenig für einen Marktpreis.",
        "chat_blocked": "Kleinanzeigen blockt gerade die Anfragen. Versuch es gleich nochmal.",
        "chat_gone": "Diese Anzeige gibt es nicht mehr (verkauft oder gelöscht).",
        "chat_error": "Bei der Analyse ist ein Fehler passiert: {error}",
        "chat_private": "🔒 Dieser Bot ist privat. Bitte den Besitzer, dich freizuschalten.",
        "chat_stranger": "👤 {name} hat dem Bot geschrieben und wurde abgewiesen.\n"
                         "Zum Freischalten diese Zeile in .env eintragen und den Bot neu starten:\n"
                         "<code>TELEGRAM_ALLOWED_CHATS={id}</code>\n"
                         "(mehrere Personen mit Komma trennen)",
    },
    "en": {
        "verdict_deal": "🔥 Deal",
        "verdict_check": "🔍 Check it",
        "verdict_skip": "⛔ Skip",
        "price": "Price",
        "negotiable": "negotiable",
        "market": "Market price",
        "below_market": "below market",
        "above_market": "above market",
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
        "chat_started_links": "✅ The bot is running. Send me a link to a car ad on Kleinanzeigen "
                              "and I'll tell you whether it's worth it.",
        "chat_started": "✅ The bot is running and watching the market. Send me a link to a car ad on "
                        "Kleinanzeigen and I'll tell you whether it's worth it.",
        "chat_help": "Send me a link to a car ad on Kleinanzeigen (in the app: Share → Copy link) "
                     "and I'll work out market price, profit and risks.",
        "chat_working": "⏳ Analysing the ad, this takes a minute or two…",
        "chat_not_car": "I couldn't read make, model and first registration. Is this a car ad?",
        "chat_few_comps": "Only {n} comparable cars found, too few for a market price.",
        "chat_blocked": "Kleinanzeigen is blocking requests right now. Try again in a bit.",
        "chat_gone": "This ad no longer exists (sold or deleted).",
        "chat_error": "Something went wrong during the analysis: {error}",
        "chat_private": "🔒 This bot is private. Ask its owner to let you in.",
        "chat_stranger": "👤 {name} wrote to the bot and was turned away.\n"
                         "To let them in, add this line to .env and restart the bot:\n"
                         "<code>TELEGRAM_ALLOWED_CHATS={id}</code>\n"
                         "(separate several people with commas)",
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
