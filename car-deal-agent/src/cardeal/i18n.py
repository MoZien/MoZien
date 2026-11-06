"""User-facing texts in Arabic, German and English (config: `language`)."""

from __future__ import annotations

TEXTS: dict[str, dict[str, str]] = {
    "ar": {
        "costs": "التكاليف",
        "cost_fuel": "وقود {cost} ({km})",
        "cost_tuv": "TÜV {cost}",
        "cost_repairs": "إصلاح {cost}",
        "cost_other": "أخرى {cost}",
        "cost_vat": "ضريبة الهامش {cost}",
        "comparables_link": "{n} سيارة مشابهة",
        "comparables_range": "أغلبها {range}",
        "resale_note": "{pct} من السوق",
        "buy_note": "−{pct} تفاوض",
        "no_price": "بدون سعر",
        "offer_line": "لتحقيق ربح {profit}: اشترِ بـ {max_buy} أو أقل (البيع {resale} − التكاليف {costs})",
        "reason_no_price": "لا يوجد سعر فعلي في الإعلان: اسأل البائع عن السعر",
        "reason_broken": "يذكر الإعلان Bastler/Export أو عطلاً كبيراً: سعر السوق لسيارة صالحة للاستعمال، والإصلاح غير محسوب",
        "chat_bad_km": "عدد الكيلومترات في الإعلان ({km} km) غير منطقي، لذلك لا يمكن حساب سعر السوق. اسأل البائع عن قراءة العداد الصحيحة.",
        "details_hint": "ℹ️ اكتب «تفاصيل» لترى كيف حُسب كل رقم",
        "details_none": "لا يوجد تقرير بعد. أرسل رابط إعلان أولاً، ثم اكتب «تفاصيل».",
        "details_title": "🧮 الحساب بالتفصيل",
        "details_car": "سيارتك: {facts}",
        "details_median": "📊 {n} سيارة مشابهة، كل سعر معدّل على سنة سيارتك وكيلومتراتها (الوسيط {median}):",
        "details_market": "سعر السوق = الوسيط = {market}",
        "details_local": "📍 سعر السوق {market} = {median} × {factor}: الأسعار ضمن {radius} km من {home} {pct} مقارنة ببقية ألمانيا (من {ads} إعلاناً)",
        "local_note": "منطقتك {pct}",
        "details_effects": "(سنة أحدث {year} · كل 10.000 km إضافية {km})",
        "details_more": "… و{n} أخرى",
        "details_resale": "البيع {resale} = سعر السوق × {pct}",
        "details_buy": "الشراء {buy} = السعر {price}",
        "details_buy_vb": "الشراء {buy} = السعر {price} − {pct} تفاوض",
        "details_fuel": "وقود {cost} = {formula}",
        "details_tuv": "TÜV {cost} (منتهٍ أو ينتهي خلال شهرين)",
        "details_repairs": "إصلاح {cost}: {items}",
        "details_other": "أخرى {cost}",
        "details_profit": "📈 الربح {profit} = {resale} − {buy} − {costs}",
        "details_no_costs": "التكاليف: لا شيء",
        "reason_damaged": "صنّفها البائع كمتضررة: افحص الضرر قبل اتخاذ القرار",
        "hunt_stopping": "⏹️ حسناً، يتم إيقاف البحث…",
        "hunt_stopped": "⏹️ توقف البحث: وُجد {found}، وفُحص {checked} إعلاناً.",
        "hunt_not_running": "لا يوجد بحث قيد التشغيل حالياً.",
        "hunt_too_old": "وصل طلب البحث بينما كان البوت متوقفاً، لذلك لم يبدأ. أرسل «ابحث 3» مرة أخرى إن أردت.",
        "profit_line": "الربح {profit} = البيع {resale} − الشراء {buy} − التكاليف {costs}",
        "seller_message": "رسالة للبائع (للنسخ):",
        "no_issues": "لا توجد عيوب مذكورة في الإعلان",
        "verdict_deal": "✅ صفقة مربحة",
        "verdict_check": "🔍 مربحة – افحصها أولاً",
        "verdict_low_profit": "➖ ربح قليل",
        "verdict_skip": "⛔ لا يُنصح بالشراء",
        "negotiable": "قابل للتفاوض",
        "market": "السوق",
        "scam_risk": "خطر الاحتيال",
        "risk_low": "منخفض",
        "risk_medium": "متوسط",
        "risk_high": "مرتفع",
        "reason_profit_low": "الربح {profit} € أقل من الحد الأدنى {minimum} €",
        "reason_roi_low": "العائد {roi} أقل من الحد الأدنى {minimum}",
        "reason_few_comparables": "سعر السوق غير مؤكد (فقط {n} سيارات مشابهة)",
        "reason_wide_spread": "سعر السوق غير مؤكد: أسعار السيارات المشابهة متفاوتة كثيراً (±{spread})",
        "reason_price_high": "السعر أعلى من السوق بنسبة {pct}: لا تدفع أكثر من {offer}",
        "reason_overpriced": "السعر أعلى من السوق بنسبة {pct}: تستحق فقط إذا خفّض البائع السعر إلى {offer}",
        "reason_over_budget": "السعر يتجاوز ميزانيتك ({budget})",
        "reason_power_kw": "قوة المحرك في الإعلان ({ps} PS) نادرة لهذا الموديل، فقورنت على أنها {ps} kW: اسأل البائع عن الـ PS",
        "reason_suspicious": "أرخص من السوق بنسبة {discount}: اعرف السبب أولاً (عطل؟ احتيال؟)",
        "reason_scam": "خطر احتيال مرتفع",
        "reason_ai": "الذكاء الاصطناعي: {reason}",
        "reason_ai_caution": "الذكاء الاصطناعي ينصح بالحذر: {reason}",
        "reason_loss": "خسارة تقارب {loss} € بعد كل التكاليف",
        "chat_started": "✅ البوت يعمل ويراقب السوق. أرسل رابط أي إعلان سيارة من Kleinanzeigen وسأخبرك إن كانت تستحق.",
        "chat_started_links": "✅ البوت يعمل. أرسل رابط أي إعلان سيارة من Kleinanzeigen وسأخبرك إن كانت تستحق.",
        "chat_help": "أرسل رابط إعلان سيارة من Kleinanzeigen (في التطبيق: مشاركة ← نسخ الرابط) "
                     "وسأحسب سعر السوق والربح والمخاطر.\n"
                     "أو اكتب «ابحث 3» لأبحث لك عن 3 سيارات تستحق بين أحدث الإعلانات.\n"
                     "وبعد أي تقرير اكتب «تفاصيل» لترى السيارات المشابهة وكيف حُسب الربح.",
        "hunt_start": "🔎 أبحث عن {count} سيارات تستحق بين أحدث الإعلانات (حتى {max} إعلاناً، "
                      "وقد يستغرق ذلك حتى {minutes} دقيقة). سأرسل لك كل سيارة فور العثور عليها. اكتب «توقف» لإيقاف البحث.",
        "hunt_done": "✅ اكتمل: وُجد {found} من {count}، وفُحص {checked} إعلاناً.",
        "hunt_none": "لم توجد سيارة تستحق بين {checked} إعلاناً جديداً. حاول لاحقاً.",
        "hunt_no_search": "لا يوجد بحث مضبوط في ملف config.yaml.",
        "chat_working": "⏳ جارٍ تحليل الإعلان، يستغرق ذلك دقيقة أو دقيقتين…",
        "chat_not_car": "تعذّرت قراءة الماركة والموديل وسنة الصنع من هذا الإعلان. هل هو إعلان سيارة؟",
        "chat_few_comps": "وُجدت {n} سيارات مشابهة فقط، وهذا قليل لحساب سعر السوق.",
        "chat_blocked": "يرفض Kleinanzeigen الطلبات حالياً. حاول بعد قليل.",
        "chat_gone": "هذا الإعلان لم يعد موجوداً (بيع أو حُذف).",
        "chat_error": "حدث خطأ أثناء التحليل: {error}",
        "chat_private": "🔒 هذا البوت خاص. اطلب من صاحبه السماح لك باستخدامه.",
        "chat_stranger": "👤 {name} أرسل رسالة إلى البوت ولم يتلقَّ رداً.\n"
                         "للسماح له بإرسال الروابط، أضف هذا السطر إلى ملف ‎.env وأعد تشغيل البوت:\n"
                         "<code>TELEGRAM_ALLOWED_CHATS={id}</code>\n"
                         "(لعدة أشخاص افصل الأرقام بفاصلة)",
    },
    "de": {
        "costs": "Kosten",
        "cost_fuel": "Sprit {cost} ({km})",
        "cost_tuv": "TÜV {cost}",
        "cost_repairs": "Reparatur {cost}",
        "cost_other": "Sonstiges {cost}",
        "cost_vat": "Margensteuer {cost}",
        "comparables_link": "{n} Vergleichsautos",
        "comparables_range": "meist {range}",
        "resale_note": "{pct} vom Markt",
        "buy_note": "−{pct} Verhandlung",
        "no_price": "ohne Preis",
        "offer_line": "Für {profit} Gewinn höchstens {max_buy} zahlen (Verkauf {resale} − Kosten {costs})",
        "reason_no_price": "kein echter Preis in der Anzeige: Preis beim Verkäufer erfragen",
        "reason_broken": "laut Anzeige Bastler/Export oder großer Schaden: Marktpreis gilt für ein fahrbereites Auto, "
                         "Reparatur nicht eingerechnet",
        "chat_bad_km": "Der Kilometerstand in der Anzeige ({km} km) kann nicht stimmen, deshalb gibt es keinen "
                       "Marktpreis. Frag den Verkäufer nach dem echten Stand.",
        "details_hint": "ℹ️ Schreib «details», dann zeige ich, wie jede Zahl zustande kommt",
        "details_none": "Noch kein Bericht. Schick mir zuerst einen Link und dann «details».",
        "details_title": "🧮 Die Rechnung im Detail",
        "details_car": "Dein Auto: {facts}",
        "details_median": "📊 {n} Vergleichsautos, jeder Preis auf Baujahr und Kilometer deines Autos umgerechnet "
                          "(Median {median}):",
        "details_market": "Marktpreis = Median = {market}",
        "details_local": "📍 Marktpreis {market} = {median} × {factor}: im Umkreis von {radius} km um {home} liegen "
                         "die Preise {pct} gegenüber dem Rest Deutschlands ({ads} Anzeigen)",
        "local_note": "Region {pct}",
        "details_effects": "(ein Jahr neuer {year} · je 10.000 km mehr {km})",
        "details_more": "… und {n} weitere",
        "details_resale": "Verkauf {resale} = Marktpreis × {pct}",
        "details_buy": "Kauf {buy} = Preis {price}",
        "details_buy_vb": "Kauf {buy} = Preis {price} − {pct} Verhandlung",
        "details_fuel": "Sprit {cost} = {formula}",
        "details_tuv": "TÜV {cost} (abgelaufen oder fällig in den nächsten 2 Monaten)",
        "details_repairs": "Reparatur {cost}: {items}",
        "details_other": "Sonstiges {cost}",
        "details_profit": "📈 Gewinn {profit} = {resale} − {buy} − {costs}",
        "details_no_costs": "Kosten: keine",
        "reason_damaged": "vom Verkäufer als beschädigt markiert: Schaden erst prüfen",
        "hunt_stopping": "⏹️ Okay, ich höre auf…",
        "hunt_stopped": "⏹️ Suche gestoppt: {found} gefunden, {checked} Anzeigen geprüft.",
        "hunt_not_running": "Gerade läuft keine Suche.",
        "hunt_too_old": "Deine Suchanfrage kam an, als der Bot aus war, deshalb habe ich sie nicht gestartet. "
                        "Schick «suche 3» nochmal, wenn du willst.",
        "profit_line": "Gewinn {profit} = Verkauf {resale} − Kauf {buy} − Kosten {costs}",
        "seller_message": "Nachricht an den Verkäufer (kopieren):",
        "no_issues": "Keine Mängel in der Anzeige erwähnt",
        "verdict_deal": "✅ Lohnt sich",
        "verdict_check": "🔍 Lohnt sich – vorher prüfen",
        "verdict_low_profit": "➖ Zu wenig Gewinn",
        "verdict_skip": "⛔ Nicht kaufen",
        "negotiable": "VB",
        "market": "Markt",
        "scam_risk": "Betrugsrisiko",
        "risk_low": "niedrig",
        "risk_medium": "mittel",
        "risk_high": "hoch",
        "reason_profit_low": "Gewinn {profit} € unter Minimum {minimum} €",
        "reason_roi_low": "Rendite {roi} unter Minimum {minimum}",
        "reason_few_comparables": "Marktpreis unsicher (nur {n} Vergleichsautos)",
        "reason_wide_spread": "Marktpreis unsicher: die Vergleichspreise streuen stark (±{spread})",
        "reason_price_high": "{pct} über dem Marktpreis: höchstens {offer} zahlen",
        "reason_overpriced": "{pct} über dem Marktpreis: lohnt sich nur, wenn der Verkäufer auf {offer} runtergeht",
        "reason_over_budget": "über deinem Budget ({budget})",
        "reason_power_kw": "{ps} PS gibt es bei dem Modell kaum, verglichen als {ps} kW: Leistung beim Verkäufer nachfragen",
        "reason_suspicious": "{discount} unter Markt: Grund klären (Schaden? Betrug?)",
        "reason_scam": "hohes Betrugsrisiko",
        "reason_ai": "KI: {reason}",
        "reason_ai_caution": "KI rät zur Vorsicht: {reason}",
        "reason_loss": "Nach allen Kosten etwa {loss} € Verlust",
        "chat_started": "✅ Der Bot läuft und beobachtet den Markt. Schick mir einen Link zu einer "
                        "Kleinanzeigen-Autoanzeige und ich sag dir, ob sie sich lohnt.",
        "chat_started_links": "✅ Der Bot läuft. Schick mir einen Link zu einer Kleinanzeigen-Autoanzeige "
                              "und ich sag dir, ob sie sich lohnt.",
        "chat_help": "Schick mir den Link zu einer Autoanzeige auf Kleinanzeigen (in der App: Teilen → Link kopieren), "
                     "dann berechne ich Marktpreis, Gewinn und Risiken.\n"
                     "Oder schreib «suche 3», dann suche ich 3 lohnende Autos unter den neuesten Anzeigen.\n"
                     "Nach jedem Bericht zeigt «details» die Vergleichsautos und die ganze Rechnung.",
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
        "costs": "Costs",
        "cost_fuel": "fuel {cost} ({km})",
        "cost_tuv": "TÜV {cost}",
        "cost_repairs": "repairs {cost}",
        "cost_other": "other {cost}",
        "cost_vat": "margin VAT {cost}",
        "comparables_link": "{n} comparable cars",
        "comparables_range": "mostly {range}",
        "resale_note": "{pct} of market",
        "buy_note": "−{pct} haggling",
        "no_price": "no price",
        "offer_line": "For a {profit} profit pay at most {max_buy} (sell {resale} − costs {costs})",
        "reason_no_price": "no real price in the ad: ask the seller",
        "reason_broken": "the ad says tinkerer/export or major damage: the market price is for a running car, "
                         "repairs not included",
        "chat_bad_km": "The ad's mileage ({km} km) can't be right, so there is no market price. "
                       "Ask the seller for the real reading.",
        "details_hint": "ℹ️ Write \"details\" to see how every number was worked out",
        "details_none": "No report yet. Send me a link first, then \"details\".",
        "details_title": "🧮 The calculation in detail",
        "details_car": "Your car: {facts}",
        "details_median": "📊 {n} comparable cars, each price adjusted to your car's age and mileage "
                          "(median {median}):",
        "details_market": "Market price = median = {market}",
        "details_local": "📍 Market price {market} = {median} × {factor}: within {radius} km of {home} prices are "
                         "{pct} against the rest of Germany ({ads} ads)",
        "local_note": "region {pct}",
        "details_effects": "(one year newer {year} · each 10,000 km more {km})",
        "details_more": "… and {n} more",
        "details_resale": "Sell {resale} = market price × {pct}",
        "details_buy": "Buy {buy} = price {price}",
        "details_buy_vb": "Buy {buy} = price {price} − {pct} haggling",
        "details_fuel": "Fuel {cost} = {formula}",
        "details_tuv": "TÜV {cost} (expired or due within 2 months)",
        "details_repairs": "Repairs {cost}: {items}",
        "details_other": "Other {cost}",
        "details_profit": "📈 Profit {profit} = {resale} − {buy} − {costs}",
        "details_no_costs": "Costs: none",
        "reason_damaged": "marked as damaged by the seller: check the damage first",
        "hunt_stopping": "⏹️ Okay, stopping…",
        "hunt_stopped": "⏹️ Search stopped: found {found}, checked {checked} ads.",
        "hunt_not_running": "No search is running right now.",
        "hunt_too_old": "Your search request arrived while the bot was off, so I didn't start it. "
                        "Send \"search 3\" again if you still want it.",
        "profit_line": "Profit {profit} = sell {resale} − buy {buy} − costs {costs}",
        "seller_message": "Message to the seller (copy):",
        "no_issues": "No defects mentioned in the ad",
        "verdict_deal": "✅ Worth it",
        "verdict_check": "🔍 Worth it – check first",
        "verdict_low_profit": "➖ Too little profit",
        "verdict_skip": "⛔ Don't buy",
        "negotiable": "negotiable",
        "market": "market",
        "scam_risk": "Scam risk",
        "risk_low": "low",
        "risk_medium": "medium",
        "risk_high": "high",
        "reason_profit_low": "profit {profit} € below minimum {minimum} €",
        "reason_roi_low": "ROI {roi} below minimum {minimum}",
        "reason_few_comparables": "market price uncertain (only {n} comparables)",
        "reason_wide_spread": "market price uncertain: comparable prices vary a lot (±{spread})",
        "reason_price_high": "{pct} above the market price: pay {offer} at most",
        "reason_overpriced": "{pct} above the market price: only worth it if the seller comes down to {offer}",
        "reason_over_budget": "above your budget ({budget})",
        "reason_power_kw": "{ps} PS hardly exists for this model, compared as {ps} kW: ask the seller for the power",
        "reason_suspicious": "{discount} below market: find out why (damage? scam?)",
        "reason_scam": "high scam risk",
        "reason_ai": "AI: {reason}",
        "reason_ai_caution": "The AI advises caution: {reason}",
        "reason_loss": "About {loss} € loss after all costs",
        "chat_started_links": "✅ The bot is running. Send me a link to a car ad on Kleinanzeigen "
                              "and I'll tell you whether it's worth it.",
        "chat_started": "✅ The bot is running and watching the market. Send me a link to a car ad on "
                        "Kleinanzeigen and I'll tell you whether it's worth it.",
        "chat_help": "Send me a link to a car ad on Kleinanzeigen (in the app: Share → Copy link) "
                     "and I'll work out market price, profit and risks.\n"
                     "Or write \"search 3\" and I'll find 3 worthwhile cars among the newest ads.\n"
                     "After any report, \"details\" shows the comparable cars and the whole calculation.",
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
