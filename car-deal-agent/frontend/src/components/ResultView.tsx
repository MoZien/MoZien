import {
  AlertTriangle,
  BadgeEuro,
  Bot,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Columns3,
  ExternalLink,
  Heart,
  Home,
  ListChecks,
  MapPin,
  MessageSquareText,
  Printer,
  RefreshCw,
  Share2,
  ShieldAlert,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { decimal, euro, km, number, pct, place, registration, signedPct } from "../lib/format";
import { type TextKey, useT } from "../lib/i18n";
import { discountOf, shareText, verdictOf } from "../lib/result";
import { navigate } from "../lib/router";
import { compareStore, garageStore, prefsStore, saveResult, savedStore, uid, updateSaved, useStore } from "../lib/store";
import type { Purpose, Result } from "../lib/types";
import { CarPhoto } from "./CarCard";
import { ChatPanel } from "./ChatPanel";
import { Meter, PriceRange, Scatter, ScoreRing, Waterfall } from "./charts";
import { Badge, Button, Card, CardHeader, Note, Row, Segmented, Tabs, type Tone, copyText, cx, useToast } from "./ui";

type Tab = "overview" | "numbers" | "ai" | "comps" | "calc" | "chat";

export function ResultView({ result, onChange, onReanalyze }: { result: Result; onChange?: (r: Result) => void; onReanalyze?: () => void }) {
  const t = useT();
  const prefs = useStore(prefsStore);
  const saved = useStore(savedStore);
  const compare = useStore(compareStore);
  const toast = useToast();
  const [view, setView] = useState<Purpose>(prefs.purpose);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const entry = saved.find((car) => car.id === result.listing.id);
  const inCompare = compare.includes(result.listing.id);
  const noMarket = result.valuation.market_price == null;

  async function evaluate(withAi: boolean, purpose: Purpose = view) {
    setBusy(withAi ? "ai" : "recalc");
    try {
      const next = await api<Result>("/api/evaluate", {
        body: { listing: result.listing, valuation: result.valuation, prefs: { ...prefs, purpose }, ai: withAi },
      });
      // A recalculation keeps an earlier AI review of the other purpose if there is no new one.
      const merged = withAi || next.analysis ? next : { ...next, analysis: result.analysis, analysis_kind: result.analysis_kind, ai_status: result.ai_status, costed_issues: result.costed_issues };
      onChange?.(merged);
      if (entry) saveResult(merged);
      toast(t("saved"), "good");
    } catch (error) {
      toast(t(`err_${(error as { code?: string }).code ?? "server"}` as TextKey, { message: "" }), "bad");
    } finally {
      setBusy(null);
    }
  }

  function toggleFavorite() {
    if (entry) updateSaved(entry.id, { favorite: !entry.favorite });
    else saveResult(result, true);
  }

  function toGarage() {
    garageStore.set((cars) => [
      {
        id: uid(), title: result.listing.title, url: result.listing.url, image: result.listing.images?.[0] ?? "",
        boughtPrice: result.trade?.buy_price || result.listing.price || 0, boughtAt: new Date().toISOString().slice(0, 10),
        costs: [
          ...(result.trade?.repair_costs ? [{ label: t("repairs"), amount: result.trade.repair_costs }] : []),
          ...(result.trade?.hu_cost ? [{ label: "TÜV", amount: result.trade.hu_cost }] : []),
          ...(result.trade?.fuel_cost ? [{ label: t("fuel"), amount: result.trade.fuel_cost }] : []),
        ],
        askingPrice: result.trade?.resale_price ?? null, soldPrice: null, soldAt: null, notes: "",
      },
      ...cars,
    ]);
    if (entry) updateSaved(entry.id, { status: "bought" });
    else updateSaved(saveResult(result).id, { status: "bought" });
    navigate("garage");
  }

  async function share() {
    const text = shareText(result, view, t);
    if (navigator.share) {
      try {
        await navigator.share({ title: result.listing.title, text });
        return;
      } catch {
        /* fall back to copying */
      }
    }
    if (await copyText(text)) toast(t("copied"), "good");
  }

  const tabs: { value: Tab; label: string; icon: React.ReactNode }[] = [
    { value: "overview", label: t("tab_overview"), icon: <Sparkles className="size-4" /> },
    { value: "numbers", label: t("tab_numbers"), icon: <BadgeEuro className="size-4" /> },
    { value: "ai", label: t("tab_ai"), icon: <Bot className="size-4" /> },
    { value: "comps", label: t("tab_comps"), icon: <Columns3 className="size-4" /> },
    { value: "calc", label: t("tab_calc"), icon: <Calculator className="size-4" /> },
    { value: "chat", label: t("tab_chat"), icon: <MessageSquareText className="size-4" /> },
  ];

  return (
    <div className="animate-fade-up space-y-5">
      <Header result={result} />

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>{t("switch_purpose")}</span>
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "personal", label: t("purpose_personal_short"), icon: <Home className="size-3.5" /> },
              { value: "trade", label: t("purpose_trade_short"), icon: <BadgeEuro className="size-3.5" /> },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={entry?.favorite ? "soft" : "secondary"} icon={<Heart className={cx("size-4", entry?.favorite && "fill-current")} />} onClick={toggleFavorite}>
            {entry?.favorite ? t("favorite") : t("add_favorite")}
          </Button>
          <Button
            size="sm"
            icon={<Columns3 className="size-4" />}
            onClick={() => {
              if (!entry) saveResult(result);
              compareStore.set((ids) => (ids.includes(result.listing.id) ? ids.filter((id) => id !== result.listing.id) : [...ids, result.listing.id].slice(-4)));
            }}
          >
            {inCompare ? t("in_compare") : t("to_compare")}
          </Button>
          {view === "trade" && !noMarket && (
            <Button size="sm" icon={<BadgeEuro className="size-4" />} onClick={toGarage}>
              {t("to_garage")}
            </Button>
          )}
          <Button size="sm" icon={<Share2 className="size-4" />} onClick={share}>
            {t("share")}
          </Button>
          <Button size="sm" variant="ghost" icon={<Printer className="size-4" />} onClick={() => window.print()}>
            {t("print")}
          </Button>
        </div>
      </div>

      {noMarket ? (
        <NoMarket result={result} onReanalyze={onReanalyze} />
      ) : (
        <>
          <div className="no-print">
            <Tabs value={tab} onChange={setTab} tabs={tabs} />
          </div>
          {tab === "overview" && <Overview result={result} view={view} />}
          {tab === "numbers" && <Numbers result={result} view={view} />}
          {tab === "ai" && <AiReview result={result} view={view} busy={busy === "ai"} onReview={() => evaluate(true)} />}
          {tab === "comps" && <Comparables result={result} />}
          {tab === "calc" && <Calculation result={result} view={view} />}
          {tab === "chat" && <ChatPanel result={result} />}
        </>
      )}

      <div className="no-print flex flex-wrap gap-2 border-t border-line pt-4">
        {!noMarket && (
          <Button size="sm" icon={<RefreshCw className="size-4" />} loading={busy === "recalc"} onClick={() => evaluate(false)}>
            {t("reevaluate")}
          </Button>
        )}
        {onReanalyze && result.listing.url && (
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} onClick={onReanalyze}>
            {t("reanalyze")}
          </Button>
        )}
        {result.listing.url && (
          <a href={result.listing.url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost" icon={<ExternalLink className="size-4" />}>
              {t("open_ad")}
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}

function Header({ result }: { result: Result }) {
  const t = useT();
  const { listing } = result;
  const [photo, setPhoto] = useState(0);
  const images = listing.images ?? [];
  const facts: { label: TextKey; value: React.ReactNode }[] = [
    { label: "mileage", value: <span className="num">{km(listing.km)}</span> },
    { label: "first_reg", value: <span className="num">{registration(listing.month, listing.year)}</span> },
    { label: "power", value: listing.power_ps ? <span className="num">{listing.power_ps} PS</span> : "–" },
    { label: "fuel", value: listing.fuel || "–" },
    { label: "gearbox", value: listing.gearbox || "–" },
    { label: "body", value: listing.body_type || "–" },
    {
      label: "tuv",
      value: listing.hu_until ? <span className="num">{listing.hu_until}</span> : listing.flags?.includes("no_tuv") ? <span className="text-bad">{t("tuv_none")}</span> : <span className="text-faint">{t("tuv_unknown")}</span>,
    },
    { label: "seller", value: listing.seller_type ? t(listing.seller_type === "private" ? "seller_private" : "seller_dealer") : "–" },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="relative bg-surface-2">
          <CarPhoto src={images[photo] ?? ""} className="aspect-[4/3] w-full md:h-full" alt={listing.title} />
          {images.length > 1 && (
            <div className="scrollbar-thin absolute inset-x-0 bottom-0 flex gap-1.5 overflow-x-auto bg-gradient-to-t from-black/60 to-transparent p-2.5">
              {images.slice(0, 10).map((src, i) => (
                <button key={src} onClick={() => setPhoto(i)} className={cx("size-12 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2", i === photo ? "border-white" : "border-transparent opacity-75")}>
                  <img src={src} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4 p-5">
          <div>
            <h1 className="text-xl font-bold leading-snug sm:text-2xl" dir="auto">
              {listing.title}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {listing.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {place(listing.location)}
                </span>
              )}
              {listing.distance_km != null && <span className="num">{number(listing.distance_km)} km</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="num text-3xl font-extrabold tracking-tight">{result.trade?.priced === false ? t("no_price") : euro(listing.price)}</span>
            <Badge tone={listing.negotiable ? "accent" : "neutral"}>{listing.negotiable ? t("negotiable") : t("fixed_price")}</Badge>
            {listing.damaged && <Badge tone="bad">{t("damaged")}</Badge>}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            {facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-xs text-faint">{t(fact.label)}</dt>
                <dd className="truncate font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Card>
  );
}

function NoMarket({ result, onReanalyze }: { result: Result; onReanalyze?: () => void }) {
  const t = useT();
  return (
    <Card className="p-6">
      <Note tone="warn" icon={<AlertTriangle className="size-4" />}>
        <p className="font-semibold">{t("few_comps", { n: result.valuation.comparables })}</p>
        <p className="mt-1">{t("few_comps_hint")}</p>
      </Note>
      <div className="mt-4 flex flex-wrap gap-2">
        {onReanalyze && (
          <Button
            variant="primary"
            icon={<RefreshCw className="size-4" />}
            onClick={() => {
              prefsStore.set((p) => ({ ...p, year_window: Math.max(p.year_window, 3) }));
              onReanalyze();
            }}
          >
            {t("widen_retry")}
          </Button>
        )}
        <Button onClick={() => navigate("valuate")}>{t("nav_valuate")}</Button>
      </div>
    </Card>
  );
}

const ratingTone: Record<string, Tone> = { steal: "good", good: "good", fair: "accent", high: "warn", overpriced: "bad", unknown: "neutral" };

function Overview({ result, view }: { result: Result; view: Purpose }) {
  const t = useT();
  const verdict = verdictOf(result, view, t)!;
  const { valuation, trade, personal, listing } = result;
  const discount = discountOf(result);
  const ai = result.analysis && result.analysis_kind === view ? result.analysis : null;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <Card className="p-5">
        <div className="flex items-center gap-5">
          <ScoreRing score={verdict.score} label={t("score")} />
          <div className="min-w-0 flex-1">
            <Badge tone={verdict.tone} className="text-sm">
              {verdict.label}
            </Badge>
            <p className="mt-2 text-sm leading-relaxed text-muted">{ai?.verdict_reason ?? verdict.reasons[0] ?? t(view === "trade" ? "purpose_trade_hint" : "purpose_personal_hint")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="neutral">{view === "trade" ? t("purpose_trade_short") : t("purpose_personal_short")}</Badge>
              {view === "personal" && personal && <Badge tone={ratingTone[personal.rating]}>{t(`rating_${personal.rating}` as TextKey)}</Badge>}
              {ai && <Badge tone="accent"><Sparkles className="size-3" /> AI</Badge>}
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-3">
          <Metric label={t("market_price")} value={euro(valuation.market_price)} sub={`${valuation.comparables} ${t("comparables")}`} />
          <Metric
            label={discount != null && discount < 0 ? t("above_market") : t("below_market")}
            value={discount == null ? "–" : pct(Math.abs(discount))}
            tone={discount == null ? undefined : discount >= 0.05 ? "good" : discount <= -0.05 ? "bad" : undefined}
          />
          {view === "trade" && trade ? (
            <Metric label={t("profit")} value={trade.priced ? euro(trade.profit) : "–"} tone={trade.profit >= 0 ? "good" : "bad"} sub={trade.priced ? `${t("roi")} ${pct(trade.roi)}` : undefined} />
          ) : personal ? (
            <Metric label={t("offer_max")} value={euro(personal.offer_max)} tone="accent" sub={`${t("offer_start")} ${euro(personal.offer_start)}`} />
          ) : null}
        </div>
        {valuation.range && valuation.market_price && (
          <PriceRange low={valuation.range[0]} high={valuation.range[1]} market={valuation.market_price} price={trade?.priced === false ? null : listing.price} labels={{ market: t("market_price"), price: t("this_car") }} />
        )}
      </Card>

      <div className="space-y-5">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">{t("why")}</h3>
          <Warnings result={result} />
          {verdict.reasons.length > 0 ? (
            <ul className="space-y-2">
              {verdict.reasons.map((reason, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span dir="auto">{reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-good">
              <CheckCircle2 className="size-4" /> {verdict.label}
            </p>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-2 text-sm font-semibold">{t("compared_with")}</h3>
          <p className="text-sm text-muted" dir="ltr">
            {valuation.basis}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Badge tone={valuation.confidence === "high" ? "good" : valuation.confidence === "medium" ? "accent" : "warn"}>
              {t("confidence")}: {t(`conf_${valuation.confidence}` as TextKey)}
            </Badge>
            {valuation.local_factor && (
              <Badge tone="neutral">
                {t("local_level")} <span className="num">{signedPct(valuation.local_factor - 1)}</span>
              </Badge>
            )}
            {valuation.range && (
              <Badge tone="neutral">
                {t("typical_range")} <span className="num">{euro(valuation.range[0])}–{euro(valuation.range[1])}</span>
              </Badge>
            )}
          </div>
          {valuation.comparables_url && (
            <a href={valuation.comparables_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              {t("open_search")} <ExternalLink className="size-3.5" />
            </a>
          )}
        </Card>
      </div>
    </div>
  );
}

function Warnings({ result }: { result: Result }) {
  const t = useT();
  const items: string[] = [];
  if (result.valuation.power_as_kw) items.push(t("power_as_kw"));
  if (!items.length) return null;
  return (
    <div className="mb-3 space-y-2">
      {items.map((text) => (
        <Note key={text} tone="warn" icon={<AlertTriangle className="size-4" />}>
          {text}
        </Note>
      ))}
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: Tone }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "accent" ? "text-accent" : "";
  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-muted">{label}</div>
      <div className={cx("num mt-0.5 truncate text-lg font-bold", color)}>{value}</div>
      {sub && <div className="num truncate text-xs text-faint">{sub}</div>}
    </div>
  );
}

function Numbers({ result, view }: { result: Result; view: Purpose }) {
  const t = useT();
  const { trade, personal, listing } = result;
  if (view === "trade" && trade) {
    const items = [
      { label: t("resale"), value: trade.resale_price },
      { label: t("buy"), value: -trade.buy_price },
      ...(trade.repair_costs ? [{ label: t("repairs"), value: -trade.repair_costs }] : []),
      ...(trade.fuel_cost ? [{ label: t("fuel"), value: -trade.fuel_cost }] : []),
      ...(trade.hu_cost ? [{ label: "TÜV", value: -trade.hu_cost }] : []),
      ...(trade.other_costs - trade.fuel_cost - trade.hu_cost ? [{ label: t("fixed_costs"), value: -(trade.other_costs - trade.fuel_cost - trade.hu_cost) }] : []),
      ...(trade.vat ? [{ label: t("margin_vat"), value: -trade.vat }] : []),
      { label: t("profit"), value: trade.profit, total: true },
    ];
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader title={t("profit")} icon={<BadgeEuro className="size-4" />} />
          <div className="mt-4">{trade.priced ? <Waterfall items={items} /> : <Note>{t("reason_no_price_short")}</Note>}</div>
        </Card>
        <Card className="p-5">
          <Row label={t("resale")} value={`${euro(trade.resale_price)} (${t("resale_note", { pct: pct(trade.resale_factor || 0.95) })})`} />
          <Row label={t("buy")} value={trade.priced ? euro(trade.buy_price) : "–"} />
          {trade.repair_costs > 0 && <Row label={t("repairs")} value={`− ${euro(trade.repair_costs)}`} />}
          {trade.fuel_cost > 0 && <Row label={t("fuel_trip", { km: `${trade.trip_legs} × ${trade.trip_km} km` })} value={`− ${euro(trade.fuel_cost)}`} />}
          {trade.hu_cost > 0 && <Row label={t("tuv_due")} value={`− ${euro(trade.hu_cost)}`} />}
          {trade.vat > 0 && <Row label={t("margin_vat")} value={`− ${euro(trade.vat)}`} />}
          <Row strong label={t("profit")} value={trade.priced ? euro(trade.profit) : "–"} tone={trade.profit >= 0 ? "good" : "bad"} />
          <Row label={t("roi")} value={trade.priced ? pct(trade.roi) : "–"} />
          <Row label={t("max_buy", { profit: euro(trade.target_profit) })} value={euro(trade.max_buy_price)} tone="accent" />
        </Card>
      </div>
    );
  }
  if (personal) {
    const ai = result.analysis_kind === "personal" ? result.analysis : null;
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader title={t(`rating_${personal.rating}` as TextKey)} icon={<Home className="size-4" />} sub={t("purpose_personal_hint")} />
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-surface-2 p-4">
              <div className="text-xs text-muted">{t("offer_start")}</div>
              <div className="num mt-1 text-2xl font-extrabold">{euro(personal.offer_start)}</div>
            </div>
            <div className="rounded-2xl bg-accent/10 p-4">
              <div className="text-xs text-accent">{t("offer_max")}</div>
              <div className="num mt-1 text-2xl font-extrabold text-accent">{euro(personal.offer_max)}</div>
            </div>
          </div>
          <div className="mt-4">
            <Row label={t("asking_price")} value={personal.priced ? euro(listing.price) : t("no_price")} />
            <Row label={t("market_price")} value={euro(personal.market)} />
            {ai?.reliability && <Row label={t("reliability")} value={<Meter value={ai.reliability} />} />}
          </div>
        </Card>
        <Card className="p-5">
          <CardHeader title={t("first_year")} icon={<Calculator className="size-4" />} />
          <div className="mt-3">
            <Row label={`${t("fuel_year")} (${decimal(personal.consumption)} ${personal.energy_unit}/100 km, ${t("estimate")})`} value={euro(personal.fuel_per_year)} />
            {personal.repairs > 0 && <Row label={t("repairs")} value={euro(personal.repairs)} />}
            {personal.hu_cost > 0 && <Row label={t("tuv_due")} value={euro(personal.hu_cost)} />}
            <Row label={t("inspection")} value={euro(personal.inspection_cost)} />
            {personal.trip_cost > 0 && <Row label={t("fuel_trip", { km: listing.distance_km ? `${listing.distance_km} km` : "" })} value={euro(personal.trip_cost)} />}
            <Row strong label={t("first_year")} value={euro(personal.first_year_cost)} />
            {ai?.yearly_upkeep_eur ? <Row label={t("upkeep")} value={euro(ai.yearly_upkeep_eur)} /> : null}
          </div>
        </Card>
      </div>
    );
  }
  return null;
}

function AiReview({ result, view, busy, onReview }: { result: Result; view: Purpose; busy: boolean; onReview: () => void }) {
  const t = useT();
  const prefs = useStore(prefsStore);
  const analysis = result.analysis;
  const matches = analysis && result.analysis_kind === view;
  const statusNote: Partial<Record<Result["ai_status"], TextKey>> = {
    off: "ai_off", unavailable: "ai_unavailable_note", failed: "ai_failed_note", quota: "ai_quota_note",
  };
  if (!analysis || !matches) {
    return (
      <Card className="p-6">
        {analysis && !matches ? (
          <Note tone="accent" icon={<Sparkles className="size-4" />}>
            {t("ai_review_other", { purpose: t(result.analysis_kind === "trade" ? "purpose_trade_short" : "purpose_personal_short") })}
          </Note>
        ) : (
          statusNote[result.ai_status] && <Note tone="warn">{t(statusNote[result.ai_status]!)}</Note>
        )}
        <Button className="mt-4" variant="primary" icon={<Sparkles className="size-4" />} loading={busy} disabled={!prefs.ai_enabled} onClick={onReview}>
          {t("ai_for_purpose")}
        </Button>
      </Card>
    );
  }
  const issues = result.costed_issues;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5 lg:col-span-2">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white">
            <Bot className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium leading-relaxed">{analysis.verdict_reason}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={analysis.scam_risk === "low" ? "good" : analysis.scam_risk === "medium" ? "warn" : "bad"}>
                <ShieldAlert className="size-3" /> {t("scam")}: {t(`risk_${analysis.scam_risk}` as TextKey)}
              </Badge>
              {analysis.reliability != null && (
                <Badge tone="neutral">
                  {t("reliability")} <span className="num">{analysis.reliability}/5</span>
                </Badge>
              )}
              {analysis.resale_difficulty && <Badge tone="neutral">{t("resale_ease")}: {t(`ease_${analysis.resale_difficulty}` as TextKey)}</Badge>}
            </div>
          </div>
        </div>
        {analysis.scam_signals?.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-bad">
            {analysis.scam_signals.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <CardHeader title={t("issues")} icon={<Wrench className="size-4" />} />
        <div className="mt-3 space-y-3">
          {issues.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-good">
              <CheckCircle2 className="size-4" /> {t("no_issues")}
            </p>
          ) : (
            issues.map((issue, i) => (
              <div key={i} className="rounded-xl bg-surface-2 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{issue.issue}</span>
                  <span className="num text-sm font-semibold text-bad">~{euro(issue.cost_eur)}</span>
                </div>
                <p className="mt-1 text-xs italic text-muted" dir="ltr">
                  “{issue.quote}”
                </p>
              </div>
            ))
          )}
        </div>
      </Card>

      {analysis.known_weak_points && analysis.known_weak_points.length > 0 && (
        <Card className="p-5">
          <CardHeader title={t("weak_points")} icon={<AlertTriangle className="size-4" />} sub={t("weak_points_note")} />
          <div className="mt-3 space-y-3">
            {analysis.known_weak_points.map((point, i) => (
              <div key={i} className="rounded-xl bg-surface-2 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{point.item}</span>
                  <span className="num text-xs text-muted">~{euro(point.typical_cost_eur)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{point.how_to_check}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <ListCard title={t("positives")} icon={<ThumbsUp className="size-4" />} items={analysis.positives} tone="good" />
      {analysis.negatives && <ListCard title={t("negatives")} icon={<ThumbsDown className="size-4" />} items={analysis.negatives} tone="bad" />}
      {analysis.inspection_checklist && <ListCard title={t("checklist")} icon={<ListChecks className="size-4" />} items={analysis.inspection_checklist} tone="accent" />}
      <ListCard title={t("questions")} icon={<ClipboardList className="size-4" />} items={analysis.questions_for_seller} tone="accent" />

      {analysis.suitability && (
        <Card className="p-5">
          <CardHeader title={t("suitability")} icon={<Home className="size-4" />} />
          <p className="mt-3 text-sm leading-relaxed text-muted">{analysis.suitability}</p>
        </Card>
      )}
      {analysis.negotiation_tip && (
        <Card className="p-5">
          <CardHeader title={t("negotiation")} icon={<BadgeEuro className="size-4" />} />
          <p className="mt-3 text-sm leading-relaxed text-muted">{analysis.negotiation_tip}</p>
        </Card>
      )}
      {analysis.seller_message && <SellerMessage text={analysis.seller_message} />}
    </div>
  );
}

function ListCard({ title, icon, items, tone }: { title: string; icon: React.ReactNode; items: string[]; tone: Tone }) {
  if (!items?.length) return null;
  const dot = tone === "good" ? "bg-good" : tone === "bad" ? "bg-bad" : "bg-accent";
  return (
    <Card className="p-5">
      <CardHeader title={title} icon={icon} />
      <ul className="mt-3 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed">
            <span className={cx("mt-2 size-1.5 shrink-0 rounded-full", dot)} />
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SellerMessage({ text }: { text: string }) {
  const t = useT();
  const toast = useToast();
  return (
    <Card className="p-5 lg:col-span-2">
      <CardHeader
        title={t("seller_message")}
        icon={<MessageSquareText className="size-4" />}
        action={
          <Button size="sm" variant="soft" onClick={async () => (await copyText(text)) && toast(t("copied"), "good")}>
            {t("copy")}
          </Button>
        }
      />
      <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-2 p-4 text-sm leading-relaxed" dir="ltr">
        {text}
      </p>
    </Card>
  );
}

function Comparables({ result }: { result: Result }) {
  const t = useT();
  const { valuation, listing } = result;
  const [sort, setSort] = useState<"near" | "price" | "km">("near");
  const used = useMemo(() => {
    const list = [...valuation.used];
    if (sort === "price") list.sort((a, b) => a.adjusted - b.adjusted);
    if (sort === "km") list.sort((a, b) => a.km - b.km);
    return list;
  }, [valuation.used, sort]);
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <CardHeader title={t("comps_chart")} icon={<Columns3 className="size-4" />} sub={`${valuation.comparables} ${t("comparables")} · ${t("adjusted")}`} />
        <div className="mt-3">
          <Scatter
            points={valuation.used.map((c) => ({ x: c.km, y: c.adjusted * (valuation.local_factor || 1), label: place(c.location), href: c.url }))}
            target={listing.km != null && listing.price ? { x: listing.km, y: listing.price } : null}
            marketY={valuation.market_price}
            xLabel={t("mileage")}
            yLabel={t("market_price")}
            targetLabel={t("this_car")}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {valuation.year_effect != null && (
            <span>
              {t("year_effect")}: <span className="num">{signedPct(valuation.year_effect)}</span>
            </span>
          )}
          {valuation.km_effect != null && (
            <span>
              {t("km_effect")}: <span className="num">{signedPct(valuation.km_effect)}</span>
            </span>
          )}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <span className="text-sm font-semibold">{t("tab_comps")}</span>
          <Segmented
            size="sm"
            value={sort}
            onChange={setSort}
            options={[
              { value: "near", label: "≈" },
              { value: "price", label: "€" },
              { value: "km", label: "km" },
            ]}
          />
        </div>
        <div className="divide-y divide-line">
          {used.map((comp, i) => (
            <a key={i} href={comp.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
              <span className="num w-7 shrink-0 text-xs text-faint">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium" dir="auto">
                  {comp.title}
                </span>
                <span className="num block text-xs text-muted">
                  {km(comp.km)} · EZ {registration(comp.month, comp.year)} · {place(comp.location)}
                </span>
              </span>
              <span className="text-end">
                <span className="num block font-semibold">{euro(comp.adjusted)}</span>
                {comp.adjusted !== comp.price && <span className="num block text-xs text-faint line-through">{euro(comp.price)}</span>}
              </span>
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Calculation({ result, view }: { result: Result; view: Purpose }) {
  const t = useT();
  const prefs = useStore(prefsStore);
  const { valuation, trade, personal, listing } = result;
  const median = valuation.median ?? valuation.market_price;
  return (
    <Card className="space-y-1 p-5">
      <Row label={t("calc_median", { n: valuation.comparables })} value={euro(median)} />
      {valuation.local_factor && (
        <Row label={t("calc_local", { pct: signedPct(valuation.local_factor - 1), n: valuation.local_ads })} value={`× ${decimal(valuation.local_factor)}`} />
      )}
      <Row strong label={t("market_price")} value={euro(valuation.market_price)} />
      {view === "trade" && trade && (
        <>
          <div className="h-3" />
          <Row label={t("calc_resale", { pct: pct(trade.resale_factor || 0.95) })} value={euro(trade.resale_price)} />
          {trade.priced && (
            <Row
              label={trade.buy_price < (listing.price ?? 0) ? t("calc_buy_vb", { pct: pct(1 - trade.buy_price / (listing.price || 1)) }) : t("calc_buy_fixed")}
              value={euro(trade.buy_price)}
            />
          )}
          {trade.fuel_cost > 0 && (
            <Row
              label={<>{t("fuel")} = <Formula>{`${trade.trip_legs} × ${trade.trip_km} km × ${decimal(trade.consumption)} l/100 km × ${decimal(trade.fuel_price)} €/l`}</Formula></>}
              value={euro(trade.fuel_cost)}
            />
          )}
          {trade.hu_cost > 0 && <Row label={t("tuv_due")} value={euro(trade.hu_cost)} />}
          {trade.repair_costs > 0 && <Row label={t("repairs")} value={euro(trade.repair_costs)} />}
          {trade.other_costs - trade.fuel_cost - trade.hu_cost > 0 && <Row label={t("fixed_costs")} value={euro(trade.other_costs - trade.fuel_cost - trade.hu_cost)} />}
          {trade.vat > 0 && <Row label={t("margin_vat")} value={euro(trade.vat)} />}
          <Row strong label={<>{t("calc_profit")}: <Formula>{`${euro(trade.resale_price)} − ${euro(trade.buy_price)} − ${euro(trade.total_costs)}`}</Formula></>} value={trade.priced ? euro(trade.profit) : "–"} tone={trade.profit >= 0 ? "good" : "bad"} />
        </>
      )}
      {view === "personal" && personal && (
        <>
          <div className="h-3" />
          <Row label={t("offer_start")} value={euro(personal.offer_start)} />
          <Row label={t("offer_max")} value={euro(personal.offer_max)} />
          <Row
            label={<>{t("fuel_year")} = <Formula>{`${number(prefs.annual_km)} km ÷ 100 × ${decimal(personal.consumption)} ${personal.energy_unit} × ${decimal(personal.energy_price)} €`}</Formula></>}
            value={euro(personal.fuel_per_year)}
          />
          <Row strong label={t("first_year")} value={euro(personal.first_year_cost)} />
        </>
      )}
    </Card>
  );
}

/** A calculation that reads left to right in every language. */
function Formula({ children }: { children: React.ReactNode }) {
  return <span className="num text-text">{children}</span>;
}
