from helpers import make_analysis

from cardeal.analyzer import RedFlag
from cardeal.models import DealReport, FlipEstimate, Listing, Valuation
from cardeal.notifier import TELEGRAM_LIMIT, format_report, to_plain_text


def report(analysis=None):
    listing = Listing(
        id="a", source="kleinanzeigen", url="https://www.kleinanzeigen.de/s-anzeige/x/1-216-1",
        title="Golf <GTI> & more", price=6200, negotiable=True, year=2014, month=8, km=72_500,
        location="10115 Mitte", seller_type="private", hu_until="03/2027",
    )
    return DealReport(
        listing=listing,
        valuation=Valuation(8900, 14, 0.18, "high", "regression"),
        flip=FlipEstimate(5890, 8455, 300, 370, 0, 1895, 0.29),
        verdict="deal",
        reasons=["solid"],
        analysis=analysis,
        search_name="Golf",
    )


def test_format_report_arabic_with_analysis():
    analysis = make_analysis(
        summary="سيارة نظيفة", red_flags=[RedFlag(issue="المكيف بحاجة تعبئة", severity="low", estimated_cost_eur=300)],
        questions_for_seller=["هل يوجد سجل صيانة؟"],
    )
    text = format_report(report(analysis), "ar")
    assert "🔥 لقطة" in text
    assert "Golf &lt;GTI&gt; &amp; more" in text  # escaped for Telegram HTML
    assert "6.200 €" in text and "8.900 €" in text and "1.895 €" in text
    assert "72.500 km" in text and "EZ 08/2014" in text
    assert "المكيف بحاجة تعبئة (~300 €)" in text
    assert text.endswith('<a href="https://www.kleinanzeigen.de/s-anzeige/x/1-216-1">'
                         "https://www.kleinanzeigen.de/s-anzeige/x/1-216-1</a>")


def test_format_report_german_without_analysis():
    text = to_plain_text(format_report(report(), "de"))
    assert "Schnäppchen" in text
    assert "Golf <GTI> & more" in text
    assert "unter Markt 30 %" in text
    assert "KI-Analyse" not in text


def test_long_messages_fit_telegram_and_keep_the_link():
    analysis = make_analysis(questions_for_seller=["Frage " * 40] * 40)
    text = format_report(report(analysis), "de")
    assert len(text) <= TELEGRAM_LIMIT
    assert text.endswith("</a>")
    assert text.count("<b>") == text.count("</b>")


def test_price_above_market_is_worded_as_such():
    expensive = report()
    expensive.listing.price = 9_300
    assert "über Markt 4 %" in to_plain_text(format_report(expensive, "de"))
    assert "أغلى من السوق بـ 4 %" in format_report(expensive, "ar")
