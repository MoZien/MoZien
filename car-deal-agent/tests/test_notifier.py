from helpers import issue, make_analysis

from cardeal.models import DealReport, FlipEstimate, Listing, Valuation
from cardeal.notifier import TELEGRAM_LIMIT, format_report, to_plain_text


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
    assert lines[3] == "📈 الربح ~1.895 € = بيع ~8.455 € − شراء ~5.890 € − مصاريف 670 €"
    assert lines[4] == "🔧 المكيف بحاجة تعبئة ~300 € – “Klima muss befüllt werden”"
    assert "Motorschaden" not in text  # an invented quote never shows up as a cost
    assert lines[5] == "🧠 سيارة نظيفة وسعرها منيح"
    assert lines[6] == "❓ في سجل صيانة؟ · إيمت انغيّر الزيت؟"  # at most two questions
    assert len(lines) == 8 and lines[7].startswith("🔗 <a href=")  # AI reason not repeated


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
    assert "💰 Zahl höchstens 6.390 €, dann bleiben 500 € Gewinn" in text
    assert "✉️ Nachricht an den Verkäufer (kopieren):\n<pre>Guten Tag,\nist der Golf noch da?" in text
    assert text.endswith("</a>")  # the ad link stays last (link preview)

    r.verdict = "skip"
    skipped = format_report(r, "de")
    assert "💰" not in skipped and "✉️" not in skipped  # no offer for a car to skip
