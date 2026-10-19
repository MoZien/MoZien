from helpers import issue, make_analysis

from cardeal.models import Comparable, DealReport, FlipEstimate, Listing, Valuation
from cardeal.notifier import (
    TELEGRAM_LIMIT,
    format_details,
    format_report,
    to_plain_text,
)


def report(analysis=None, description="Klima muss befüllt werden. Scheckheft vorhanden."):
    listing = Listing(
        id="a", source="kleinanzeigen", url="https://www.kleinanzeigen.de/s-anzeige/x/1-216-1",
        title="Golf <GTI> & more", price=6200, negotiable=True, year=2014, month=8, km=72_500,
        location="10115 Mitte", seller_type="private", hu_until="03/2027", description=description,
    )
    return DealReport(
        listing=listing,
        valuation=Valuation(8900, 14, 0.18, "high", "regression"),
        flip=FlipEstimate(5890, 8455, 300, 370, 0, 1895, 0.29),
        verdict="deal",
        reasons=[f"AI: {analysis.verdict_reason}"] if analysis else [],
        analysis=analysis,
        search_name="Golf",
    )


def test_short_report_in_arabic_with_quoted_repair():
    analysis = make_analysis(
        verdict_reason="سيارة نظيفة وسعرها منيح",
        issues=[issue("المكيف بحاجة تعبئة"),
                issue("محرك", quote="Motorschaden laut Werkstatt", cost=2500)],  # quote not in the ad
        questions_for_seller=["في سجل صيانة؟", "إيمت انغيّر الزيت؟", "سؤال تالت"],
    )
    text = format_report(report(analysis), "ar")
    assert "\u2066(−30 %)\u2069" in text  # numbers isolated, so right-to-left can't scramble them
    lines = text.replace("\u2066", "").replace("\u2069", "").split("\n")
    assert lines[0] == "<b>🔥 لقطة · Golf &lt;GTI&gt; &amp; more</b>"
    assert lines[1] == "📍 10115 Mitte · 72.500 km · EZ 08/2014 · TÜV 03/2027"
    assert lines[2] == "💶 <b>6.200 €</b> قابل للتفاوض ← السوق ~8.900 € (−30 %)"
    assert lines[3] == "📈 الربح ~1.895 € = بيع ~8.455 € (95 % من السوق) − شراء ~5.890 € (−5 % تفاوض) − مصاريف 670 €"
    assert lines[4] == "🧾 المصاريف: تصليح 300 € · غيرها 370 €"
    assert lines[5] == "🔧 المكيف بحاجة تعبئة ~300 € – “Klima muss befüllt werden”"
    assert "Motorschaden" not in text  # an invented quote never shows up as a cost
    assert lines[6] == "🧠 سيارة نظيفة وسعرها منيح"
    assert lines[7] == "❓ في سجل صيانة؟ · إيمت انغيّر الزيت؟"  # at most two questions
    assert len(lines) == 9 and lines[8].startswith("🔗 <a href=")  # AI reason not repeated


def test_report_says_when_the_ad_mentions_no_defects():
    text = to_plain_text(format_report(report(make_analysis(), description="Top gepflegt."), "de"))
    assert "🔧 Keine Mängel in der Anzeige erwähnt" in text
    assert "Golf <GTI> & more" in text
    assert "→ Markt ~8.900 € (−30 %)" in text
    assert "solid car" in text and text.count("solid car") == 1  # AI reason not repeated


def test_report_without_analysis_and_scam_warning():
    plain = to_plain_text(format_report(report(), "de"))
    assert "🔧" not in plain and "🧠" not in plain
    risky = make_analysis(scam_risk="high", scam_signals=["Verkäufer im Ausland"])
    assert "🚩 Betrugsrisiko hoch: Verkäufer im Ausland" in to_plain_text(format_report(report(risky), "de"))


def test_long_messages_fit_telegram_and_keep_the_link():
    analysis = make_analysis(verdict_reason="Frage " * 2000)
    text = format_report(report(analysis), "de")
    assert len(text) <= TELEGRAM_LIMIT
    assert text.endswith("</a>")
    assert text.count("<b>") == text.count("</b>")


def test_price_above_market_is_shown_with_plus():
    expensive = report()
    expensive.listing.price = 9_300
    assert "(+4 %)" in to_plain_text(format_report(expensive, "de"))


def test_due_tuv_and_its_cost_are_shown():
    due = report()
    due.flip.hu_cost = 200
    assert "TÜV 03/2027 ⚠️ +200 €" in to_plain_text(format_report(due, "de"))
    assert "TÜV" in to_plain_text(format_report(report(), "de")) and "⚠️" not in format_report(report(), "de")


def test_comparables_line_links_to_the_search_and_preview_stays_on_the_ad():
    from cardeal.notifier import TelegramClient

    r = report()
    r.valuation.basis = "Golf · Benzin · Manuell · 92–152 PS · 2012–2016"
    r.valuation.comparables_url = "https://www.kleinanzeigen.de/s-autos/c216+autos.model_s:golf"
    text = format_report(r, "de")
    assert ('📊 <a href="https://www.kleinanzeigen.de/s-autos/c216+autos.model_s:golf">14 Vergleichsautos</a>: '
            "Golf · Benzin · Manuell · 92–152 PS · 2012–2016") in text

    class Session:
        def post(self, url, json, timeout):
            self.sent = json
            return type("R", (), {"status_code": 200, "json": lambda _: {"ok": True, "result": {}}})()

    session = Session()
    TelegramClient("t", session).send_message("1", text)
    assert session.sent["link_preview_options"] == {"url": r.listing.url}


def test_max_purchase_price_and_seller_message():
    analysis = make_analysis(seller_message="Guten Tag,\nist der Golf noch da? Würden Sie 5.500 € nehmen?")
    r = report(analysis)
    r.flip.max_buy_price, r.flip.target_profit = 6_390, 500
    text = format_report(r, "de")
    assert "💰" not in text  # the max purchase price only guides the offer in the message
    assert "✉️ Nachricht an den Verkäufer (kopieren):\n<pre>Guten Tag,\nist der Golf noch da?" in text
    assert text.endswith("</a>")  # the ad link stays last (link preview)

    r.verdict = "skip"
    skipped = format_report(r, "de")
    assert "💰" not in skipped and "✉️" not in skipped  # no offer for a car to skip


def test_cost_breakdown_names_fuel_trip_and_tuv():
    r = report()
    r.flip.other_costs, r.flip.fuel_cost, r.flip.trip_km, r.flip.trip_legs, r.flip.hu_cost = 186, 36, 145, 2, 150
    r.flip.repair_costs = 0
    assert "🧾 Kosten: Sprit ~36 € (2 × 145 km) · TÜV 150 €" in to_plain_text(format_report(r, "de"))


def valued_report():
    """A report as the pipeline makes it: comparables used, effects, fuel, TÜV, repairs, local level."""
    r = report(make_analysis(issues=[issue()]))
    r.valuation = Valuation(
        8_900, 4, 0.12, "low", "regression", basis="Golf · Benzin · Manuell · 100–110 PS · 2012–2016",
        comparables_url="https://www.kleinanzeigen.de/s-autos/golf", year_effect=0.08, km_effect=-0.04,
        used=[Comparable(f"https://k/{i}", "VW Golf", price, adjusted, km, 2014, 6, f"0410{i} Leipzig")
              for i, (price, adjusted, km) in enumerate([(9_000, 9_400, 72_000), (8_500, 8_500, 72_500),
                                                          (9_800, 9_100, 95_000), (9_900, 9_600, 60_000)])],
        local_factor=0.95, local_ads=133,
    )
    r.flip = FlipEstimate(5_890, 8_455, 300, 400, 0, 1_865, 0.28, hu_cost=150, fuel_cost=50, trip_km=160,
                          trip_legs=2, fuel_price=2.1, consumption=7.5, resale_factor=0.95)
    return r


def test_details_show_every_step_of_the_calculation():
    text = to_plain_text(format_details(valued_report(), "de", "06108", 150))
    lines = text.split("\n")
    assert lines[0] == "🧮 Die Rechnung im Detail · Golf <GTI> & more"
    assert lines[1] == "Dein Auto: 10115 Mitte · 72.500 km · EZ 08/2014 · TÜV 03/2027 ⚠️ +150 €"
    assert lines[2] == ("📊 4 Vergleichsautos, jeder Preis auf Baujahr und Kilometer deines Autos umgerechnet "
                        "(Median 9.250 €):")
    assert lines[3] == "(ein Jahr neuer +8 % · je 10.000 km mehr −4 %)"
    assert lines[4] == "1. 9.000 € → 9.400 € · 72.000 km · EZ 06/2014 · Leipzig"
    assert lines[5] == "2. 8.500 € · 72.500 km · EZ 06/2014 · Leipzig"  # nothing to adjust
    assert lines[8] == ("📍 Marktpreis 8.900 € = 9.250 € × 0,95: im Umkreis von 150 km um 06108 liegen die Preise "
                        "−5 % gegenüber dem Rest Deutschlands (133 Anzeigen)")
    assert "Verkauf 8.455 € = Marktpreis × 95 %" in text
    assert "Kauf 5.890 € = Preis 6.200 € − 5 % Verhandlung" in text
    assert "🧾 Sprit 50 € = 2 × 160 km × 7,5 l/100 km × 2,1 €/l" in text
    assert "🧾 TÜV 150 € (abgelaufen oder fällig in den nächsten 2 Monaten)" in text
    assert "🧾 Reparatur 300 €: Klima undicht 300 €" in text
    assert "🧾 Sonstiges 200 €" in text  # other_costs 400 − fuel 50 − TÜV 150
    assert lines[-1] == "📈 Gewinn 1.865 € = 8.455 € − 5.890 € − 700 €"
    assert 8_455 - 5_890 - 700 == 1_865


def test_details_link_each_comparable_and_fit_telegram():
    r = valued_report()
    r.valuation.used *= 30  # 120 comparables
    html_text = format_details(r, "ar", "06108", 150)
    assert len(html_text) <= TELEGRAM_LIMIT
    assert '<a href="https://k/0">Leipzig</a>' in html_text
    assert "… و110 غيرهم" in html_text  # ten shown


def test_report_explains_resale_and_purchase_and_marks_unknown_tuv():
    r = valued_report()
    r.listing.hu_until = None
    plain = to_plain_text(format_report(r, "de"))
    assert "Verkauf ~8.455 € (95 % vom Markt)" in plain and "Kauf ~5.890 € (−5 % Verhandlung)" in plain
    assert "TÜV ?" in plain  # not in the ad: ask
    assert "📊 4 Vergleichsautos (meist 8.220–9.070 € · Region −5 %): Golf" in plain
    r.listing.description = "Läuft gut, leider kein TÜV mehr."
    assert "ohne TÜV ⚠️ +150 €" in to_plain_text(format_report(r, "de"))


def test_ad_without_a_price_gets_an_offer_limit_instead_of_a_profit():
    r = valued_report()
    r.listing.price, r.flip.priced, r.flip.max_buy_price, r.flip.target_profit = None, False, 7_055, 500
    plain = to_plain_text(format_report(r, "de"))
    assert "💶 ohne Preis VB → Markt ~8.900 €" in plain
    assert "📈 Für 500 € Gewinn höchstens 7.055 € zahlen (Verkauf ~8.455 € (95 % vom Markt) − Kosten 700 €)" in plain
    assert "Gewinn ~" not in plain
