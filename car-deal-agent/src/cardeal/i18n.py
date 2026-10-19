"""User-facing texts in Arabic, German and English (config: `language`)."""

from __future__ import annotations

TEXTS: dict[str, dict[str, str]] = {
    "ar": {
        "comparables_link": "{n} سيارة مشابهة",
        "reason_damaged": "البائع كاتب إنها متضررة: شوف الضرر قبل ما تقرر",
        "hunt_stopping": "⏹️ تمام، عم وقّف البحث…",
        "hunt_stopped": "⏹️ وقّفت البحث: لقيت {found}، وفحصت {checked} إعلان.",
        "hunt_not_running": "ما في بحث شغّال هلق.",
        "hunt_too_old": "طلب البحث تبعك وصل والبوت كان طافي، فما بلّشت فيه. ابعت «دورلي 3» من جديد إذا بدك.",
        "profit_line": "الربح {profit} = بيع {resale} − شراء {buy} − مصاريف {costs}",
        "max_buy_line": "لا تدفع أكتر من {price} لتضمن ربح {profit}",
        "seller_message": "رسالة للبائع (انسخها):",
        "no_issues": "ما في أعطال مذكورة بالإعلان",
        "verdict_deal": "🔥 لقطة",
        "verdict_check": "🔍 بدها فحص",
        "verdict_skip": "⛔ لا تشتري",
        "negotiable": "قابل للتفاوض",
        "market": "السوق",
        "scam_risk": "خطر احتيال",
        "risk_low": "منخفض",
        "risk_medium": "متوسط",
        "risk_high": "عالي",
        "reason_profit_low": "الربح {profit} € أقل من الحد الأدنى {minimum} €",
        "reason_roi_low": "العائد {roi} أقل من الحد الأدنى {minimum}",
        "reason_few_comparables": "سعر السوق مش أكيد ({n} سيارات مشابهة)",
        "reason_suspicious": "أرخص من السوق بـ {discount}: لازم تعرف السبب (عطل؟ احتيال؟)",
        "reason_scam": "خطر احتيال عالي",
        "reason_ai": "الذكاء الاصطناعي: {reason}",
        "chat_started": "✅ البوت شغّال وعم يراقب السوق. ابعتلي رابط أي إعلان سيارة من Kleinanzeigen وبقلّك إذا بتستاهل.",
        "chat_started_links": "✅ البوت شغّال. ابعتلي رابط أي إعلان سيارة من Kleinanzeigen وبقلّك إذا بتستاهل.",
        "chat_help": "ابعتلي رابط إعلان سيارة من Kleinanzeigen (بالتطبيق: مشاركة ← نسخ الرابط) "
                     "وبحسبلك سعر السوق والربح والمخاطر.\n"
                     "أو اكتب «دورلي 3» وبدورلك على 3 سيارات بتستاهل من أحدث الإعلانات.",
        "hunt_start": "🔎 عم دور على {count} سيارات بتستاهل بأحدث الإعلانات (بفحص لحد {max} إعلان، "
                      "ممكن ياخد لحد {minutes} دقيقة). كل سيارة بلاقيها ببعتلك ياها فوراً. اكتب «وقف» لتوقّف البحث.",
        "hunt_done": "✅ خلصت: لقيت {found} من {count}، وفحصت {checked} إعلان.",
        "hunt_none": "ما لقيت ولا سيارة بتستاهل بين {checked} إعلان جديد. جرّب كمان شوي.",
        "hunt_no_search": "ما في بحث مضبوط بملف config.yaml.",
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
        "comparables_link": "{n} Vergleichsautos",
        "reason_damaged": "vom Verkäufer als beschädigt markiert: Schaden erst prüfen",
        "hunt_stopping": "⏹️ Okay, ich höre auf…",
        "hunt_stopped": "⏹️ Suche gestoppt: {found} gefunden, {checked} Anzeigen geprüft.",
        "hunt_not_running": "Gerade läuft keine Suche.",
        "hunt_too_old": "Deine Suchanfrage kam an, als der Bot aus war, deshalb habe ich sie nicht gestartet. "
                        "Schick «suche 3» nochmal, wenn du willst.",
        "profit_line": "Gewinn {profit} = Verkauf {resale} − Kauf {buy} − Kosten {costs}",
        "max_buy_line": "Zahl höchstens {price}, dann bleiben {profit} Gewinn",
        "seller_message": "Nachricht an den Verkäufer (kopieren):",
        "no_issues": "Keine Mängel in der Anzeige erwähnt",
        "verdict_deal": "🔥 Schnäppchen",
        "verdict_check": "🔍 Prüfen",
        "verdict_skip": "⛔ Finger weg",
        "negotiable": "VB",
        "market": "Markt",
        "scam_risk": "Betrugsrisiko",
        "risk_low": "niedrig",
        "risk_medium": "mittel",
        "risk_high": "hoch",
        "reason_profit_low": "Gewinn {profit} € unter Minimum {minimum} €",
        "reason_roi_low": "Rendite {roi} unter Minimum {minimum}",
        "reason_few_comparables": "Marktpreis unsicher ({n} Vergleichsautos)",
        "reason_suspicious": "{discount} unter Markt: Grund klären (Schaden? Betrug?)",
        "reason_scam": "hohes Betrugsrisiko",
        "reason_ai": "KI: {reason}",
        "chat_started": "✅ Der Bot läuft und beobachtet den Markt. Schick mir einen Link zu einer "
                        "Kleinanzeigen-Autoanzeige und ich sag dir, ob sie sich lohnt.",
        "chat_started_links": "✅ Der Bot läuft. Schick mir einen Link zu einer Kleinanzeigen-Autoanzeige "
                              "und ich sag dir, ob sie sich lohnt.",
        "chat_help": "Schick mir den Link zu einer Autoanzeige auf Kleinanzeigen (in der App: Teilen → Link kopieren), "
                     "dann berechne ich Marktpreis, Gewinn und Risiken.\n"
                     "Oder schreib «suche 3», dann suche ich 3 lohnende Autos unter den neuesten Anzeigen.",
        "hunt_start": "🔎 Ich suche {count} lohnende Autos unter den neuesten Anzeigen (prüfe bis zu {max} Anzeigen, "
                      "das kann bis zu {minutes} Minuten dauern). Jeden Fund schicke ich dir sofort. "
                      "Schreib «stop» zum Abbrechen.",
        "hunt_done": "✅ Fertig: {found} von {count} gefunden, {checked} Anzeigen geprüft.",
        "hunt_none": "Unter {checked} neuen Anzeigen war kein lohnendes Auto. Versuch es später nochmal.",
        "hunt_no_search": "In config.yaml ist keine Suche eingerichtet.",
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
        "comparables_link": "{n} comparable cars",
        "reason_damaged": "marked as damaged by the seller: check the damage first",
        "hunt_stopping": "⏹️ Okay, stopping…",
        "hunt_stopped": "⏹️ Search stopped: found {found}, checked {checked} ads.",
        "hunt_not_running": "No search is running right now.",
        "hunt_too_old": "Your search request arrived while the bot was off, so I didn't start it. "
                        "Send \"search 3\" again if you still want it.",
        "profit_line": "Profit {profit} = sell {resale} − buy {buy} − costs {costs}",
        "max_buy_line": "Pay at most {price} to keep {profit} profit",
        "seller_message": "Message to the seller (copy):",
        "no_issues": "No defects mentioned in the ad",
        "verdict_deal": "🔥 Deal",
        "verdict_check": "🔍 Check it",
        "verdict_skip": "⛔ Skip",
        "negotiable": "negotiable",
        "market": "market",
        "scam_risk": "Scam risk",
        "risk_low": "low",
        "risk_medium": "medium",
        "risk_high": "high",
        "reason_profit_low": "profit {profit} € below minimum {minimum} €",
        "reason_roi_low": "ROI {roi} below minimum {minimum}",
        "reason_few_comparables": "market price uncertain ({n} comparables)",
        "reason_suspicious": "{discount} below market: find out why (damage? scam?)",
        "reason_scam": "high scam risk",
        "reason_ai": "AI: {reason}",
        "chat_started_links": "✅ The bot is running. Send me a link to a car ad on Kleinanzeigen "
                              "and I'll tell you whether it's worth it.",
        "chat_started": "✅ The bot is running and watching the market. Send me a link to a car ad on "
                        "Kleinanzeigen and I'll tell you whether it's worth it.",
        "chat_help": "Send me a link to a car ad on Kleinanzeigen (in the app: Share → Copy link) "
                     "and I'll work out market price, profit and risks.\n"
                     "Or write \"search 3\" and I'll find 3 worthwhile cars among the newest ads.",
        "hunt_start": "🔎 Looking for {count} worthwhile cars among the newest ads (checking up to {max} ads, "
                      "this can take up to {minutes} minutes). I'll send each find right away. "
                      "Write \"stop\" to cancel.",
        "hunt_done": "✅ Done: found {found} of {count}, checked {checked} ads.",
        "hunt_none": "No worthwhile car among {checked} new ads. Try again later.",
        "hunt_no_search": "No search is set up in config.yaml.",
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
