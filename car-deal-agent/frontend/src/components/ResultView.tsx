import {
  AlertTriangle,
  BadgeEuro,
  CheckCircle2,
  Columns3,
  Expand,
  ExternalLink,
  Heart,
  Loader2,
  MapPin,
  MoreHorizontal,
  Printer,
  RefreshCw,
  Share2,
  ShieldAlert,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { api } from "../lib/api";
import { decimal, euro, isolateNumbers, km, number, pct, place, registration, signedPct } from "../lib/format";
import { type TextKey, useT } from "../lib/i18n";
import { discountOf, shareText, verdictOf } from "../lib/result";
import { navigate } from "../lib/router";
import { compareStore, garageStore, prefsStore, saveResult, savedStore, uid, updateSaved, useStore } from "../lib/store";
import type { Purpose, Result } from "../lib/types";
import { CarPhoto, toneText } from "./CarCard";
import { Lightbox, photoSize } from "./Lightbox";
import { ChatPanel } from "./ChatPanel";
import { PurposeSwitch } from "./PurposeSwitch";
import { Meter, PriceRange, Scatter } from "./charts";
import { Badge, Button, Card, Modal, Note, Num, Row, Segmented, Tabs, type Tone, copyText, cx, useToast } from "./ui";

type Tab = "summary" | "ai" | "market" | "chat";

export function ResultView({ result, onChange, onReanalyze }: { result: Result; onChange?: (r: Result) => void; onReanalyze?: () => void }) {
  const t = useT();
  const prefs = useStore(prefsStore);
  const saved = useStore(savedStore);
  const compare = useStore(compareStore);
  const toast = useToast();
  const [view, setView] = useState<Purpose>(prefs.purpose);
  const [tab, setTab] = useState<Tab>("summary");
  const [busy, setBusy] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
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
      toast(t("updated"), "good");
    } catch (error) {
      const reason = (error as { details?: { reason?: string } }).details?.reason;
      toast(reason ? t(`ai_reason_${reason}` as TextKey) : t(`err_${(error as { code?: string }).code ?? "server"}` as TextKey, { message: "" }), "bad");
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

  const tabs: { value: Tab; label: string }[] = [
    { value: "summary", label: t("tab_summary") },
    { value: "ai", label: t("tab_ai") },
    { value: "market", label: t("tab_market") },
    { value: "chat", label: t("tab_chat") },
  ];

  const menu: { label: string; icon: ReactNode; onClick: () => void; hidden?: boolean }[] = [
    {
      label: inCompare ? t("in_compare") : t("to_compare"),
      icon: <Columns3 className="size-5" />,
      onClick: () => {
        if (!entry) saveResult(result);
        compareStore.set((ids) => (ids.includes(result.listing.id) ? ids.filter((id) => id !== result.listing.id) : [...ids, result.listing.id].slice(-4)));
        toast(inCompare ? t("removed") : t("added_compare"), "good");
      },
    },
    { label: t("to_garage"), icon: <BadgeEuro className="size-5" />, onClick: toGarage, hidden: noMarket },
    { label: t("reevaluate"), icon: <RefreshCw className="size-5" />, onClick: () => evaluate(false), hidden: noMarket },
    { label: t("reanalyze"), icon: <RefreshCw className="size-5" />, onClick: () => onReanalyze?.(), hidden: !onReanalyze || !result.listing.url },
    { label: t("print"), icon: <Printer className="size-5" />, onClick: () => window.print() },
  ];

  return (
    <div className="animate-fade-up space-y-4">
      <Header result={result} />

      <div className="no-print grid grid-cols-4 gap-2">
        <Action icon={<Heart className={cx("size-5", entry?.favorite && "fill-current")} />} label={entry?.favorite ? t("saved") : t("save")} onClick={toggleFavorite} active={entry?.favorite} />
        <Action icon={<Share2 className="size-5" />} label={t("share")} onClick={share} />
        {result.listing.url ? <Action icon={<ExternalLink className="size-5" />} label={t("the_ad")} href={result.listing.url} /> : <span />}
        <Action icon={busy === "recalc" ? <Loader2 className="size-5 animate-spin" /> : <MoreHorizontal className="size-5" />} label={t("nav_more")} onClick={() => setMenuOpen(true)} />
      </div>

      {noMarket ? (
        <NoMarket result={result} onReanalyze={onReanalyze} />
      ) : (
        <>
          <VerdictCard result={result} view={view} onView={setView} />
          <div className="no-print pt-1">
            <Tabs value={tab} onChange={setTab} tabs={tabs} />
          </div>
          {tab === "summary" && <Summary result={result} view={view} />}
          {tab === "ai" && <AiReview result={result} view={view} busy={busy === "ai"} onReview={() => evaluate(true)} />}
          {tab === "market" && <Market result={result} view={view} />}
          {tab === "chat" && <ChatPanel result={result} />}
        </>
      )}

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title={t("nav_more")}>
        <div className="-mx-2 divide-y divide-line">
          {menu
            .filter((item) => !item.hidden)
            .map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  setMenuOpen(false);
                  item.onClick();
                }}
                className="flex w-full cursor-pointer items-center gap-3 px-2 py-3.5 text-start text-[15px] hover:bg-surface-2"
              >
                <span className="text-muted">{item.icon}</span>
                {item.label}
              </button>
            ))}
        </div>
      </Modal>
    </div>
  );
}

/** A square action: icon over a short label, four always fit on one phone row. */
function Action({ icon, label, onClick, href, active }: { icon: ReactNode; label: string; onClick?: () => void; href?: string; active?: boolean }) {
  const className = cx(
    "flex h-16 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-1 text-xs font-medium transition hover:bg-surface-2",
    active ? "border-text bg-surface-2" : "border-line bg-surface",
  );
  const body = (
    <>
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function Header({ result }: { result: Result }) {
  const t = useT();
  const { listing } = result;
  const [photo, setPhoto] = useState(0);
  const [gallery, setGallery] = useState(false);
  const images = listing.images ?? [];
  const facts: { label: TextKey; value: ReactNode }[] = [
    { label: "mileage", value: <span className="num">{km(listing.km)}</span> },
    { label: "first_reg", value: <span className="num">{registration(listing.month, listing.year)}</span> },
    { label: "power", value: listing.power_ps ? <span className="num">{listing.power_ps} PS</span> : "–" },
    { label: "fuel", value: listing.fuel || "–" },
    { label: "gearbox", value: listing.gearbox || "–" },
    {
      label: "tuv",
      value: listing.hu_until ? <span className="num">{listing.hu_until}</span> : listing.flags?.includes("no_tuv") ? <span className="text-bad">{t("tuv_none")}</span> : <span className="text-faint">{t("tuv_unknown")}</span>,
    },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2">
        <div className="bg-surface-2">
          {images.length > 0 ? (
            <button type="button" onClick={() => setGallery(true)} className="relative block w-full cursor-zoom-in" aria-label={t("photos_open")}>
              <CarPhoto src={images[photo] ?? ""} className="aspect-[4/3] w-full" alt={listing.title} />
              <span className="num absolute bottom-2.5 end-2.5 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                <Expand className="size-3.5" /> {photo + 1}/{images.length}
              </span>
            </button>
          ) : (
            <CarPhoto src="" className="aspect-[4/3] w-full" alt={listing.title} />
          )}
          {images.length > 1 && (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto p-2">
              {images.slice(0, 12).map((src, i) => (
                <button key={src} onClick={() => setPhoto(i)} className={cx("size-12 shrink-0 cursor-pointer overflow-hidden rounded-md border-2", i === photo ? "border-text" : "border-transparent opacity-70")}>
                  <img src={photoSize(src, 2)} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {gallery && <Lightbox images={images.slice(0, 12)} start={photo} onClose={() => setGallery(false)} />}
        </div>
        <div className="p-4 sm:p-5">
          <h1 className="text-lg font-semibold leading-snug sm:text-xl">
            <bdi>{listing.title}</bdi>
          </h1>
          {listing.location && (
            <div className="mt-1 flex items-center gap-1 text-sm text-muted">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{place(listing.location)}</span>
              {listing.distance_km != null && (
                <>
                  <span>·</span>
                  <span className="num shrink-0">{number(listing.distance_km)} km</span>
                </>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="num text-[28px] font-semibold leading-none tracking-tight">{result.trade?.priced === false ? t("no_price") : euro(listing.price)}</span>
            <span className="text-sm text-muted">{listing.negotiable ? t("negotiable") : t("fixed_price")}</span>
            {listing.damaged && <Badge tone="bad">{t("damaged")}</Badge>}
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3 border-t border-line pt-4 text-sm">
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
    <Card className="p-5">
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

/** The answer in one place: verdict, the three numbers that matter and where the price sits. */
function VerdictCard({ result, view, onView }: { result: Result; view: Purpose; onView: (p: Purpose) => void }) {
  const t = useT();
  const verdict = verdictOf(result, view, t)!;
  const { valuation, trade, personal, listing } = result;
  const discount = discountOf(result);
  const ai = result.analysis && result.analysis_kind === view ? result.analysis : null;
  const reason = ai?.verdict_reason ?? verdict.reasons[0];
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-muted">{t("result_for")}</span>
        <PurposeSwitch tiny value={view} onChange={onView} />
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        <span className={cx("font-semibold leading-tight tracking-tight", verdict.label.length > 16 ? "text-2xl" : "text-[28px]", toneText[verdict.tone])}>{verdict.label}</span>
        <span className="num text-sm text-muted">{verdict.score}/100</span>
      </div>
      {reason && (
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{isolateNumbers(reason)}</p>
      )}
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
        <Metric label={t("market_price")} value={euro(valuation.market_price)} sub={<><Num>{valuation.comparables}</Num> {t("comparables")}</>} />
        <Metric
          label={discount != null && discount < 0 ? t("above_market") : t("below_market")}
          value={discount == null ? "–" : pct(Math.abs(discount))}
          tone={discount == null ? undefined : discount >= 0.05 ? "good" : discount <= -0.05 ? "bad" : undefined}
        />
        {view === "trade" && trade ? (
          <Metric label={t("profit")} value={trade.priced ? euro(trade.profit) : "–"} tone={trade.profit >= 0 ? "good" : "bad"} sub={trade.priced ? <>{t("roi")} <Num>{pct(trade.roi)}</Num></> : undefined} />
        ) : personal ? (
          <Metric label={t("offer_max")} value={euro(personal.offer_max)} sub={<>{t("offer_start")} <Num>{euro(personal.offer_start)}</Num></>} />
        ) : null}
      </div>
      {valuation.range && valuation.market_price && (
        <PriceRange low={valuation.range[0]} high={valuation.range[1]} market={valuation.market_price} price={trade?.priced === false ? null : listing.price} labels={{ market: t("market_price"), price: t("this_car") }} />
      )}
    </Card>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-muted">{label}</div>
      <div className={cx("num mt-0.5 truncate text-base font-semibold sm:text-lg", tone && toneText[tone])}>{value}</div>
      {sub && <div className="text-xs leading-snug text-faint">{sub}</div>}
    </div>
  );
}

/** Why the verdict, and the money in plain rows. */
function Summary({ result, view }: { result: Result; view: Purpose }) {
  const t = useT();
  const verdict = verdictOf(result, view, t)!;
  const { trade, personal, listing } = result;
  const ai = result.analysis_kind === "personal" ? result.analysis : null;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-4 sm:p-5">
        <h3 className="mb-3 text-[15px] font-semibold">{t("why")}</h3>
        {result.valuation.power_as_kw && (
          <div className="mb-3">
            <Note tone="warn" icon={<AlertTriangle className="size-4" />}>
              {t("power_as_kw")}
            </Note>
          </div>
        )}
        {verdict.reasons.length > 0 ? (
          <ul className="space-y-2.5">
            {verdict.reasons.map((reason, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted" />
                <span>{isolateNumbers(reason)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-good">
            <CheckCircle2 className="size-4" /> {t("no_objections")}
          </p>
        )}
      </Card>

      {view === "trade" && trade && (
        <Card className="p-4 sm:p-5">
          <h3 className="mb-2 text-[15px] font-semibold">{t("money")}</h3>
          <Row label={t("resale")} value={euro(trade.resale_price)} />
          <Row label={t("buy")} value={trade.priced ? `− ${euro(trade.buy_price)}` : "–"} />
          {trade.repair_costs > 0 && <Row label={t("repairs")} value={`− ${euro(trade.repair_costs)}`} />}
          {trade.fuel_cost > 0 && <Row label={t("fuel_trip", { km: `${trade.trip_legs} × ${trade.trip_km} km` })} value={`− ${euro(trade.fuel_cost)}`} />}
          {trade.hu_cost > 0 && <Row label={t("tuv_due")} value={`− ${euro(trade.hu_cost)}`} />}
          {trade.other_costs - trade.fuel_cost - trade.hu_cost > 0 && <Row label={t("fixed_costs")} value={`− ${euro(trade.other_costs - trade.fuel_cost - trade.hu_cost)}`} />}
          {trade.vat > 0 && <Row label={t("margin_vat")} value={`− ${euro(trade.vat)}`} />}
          <Row strong label={t("profit")} value={trade.priced ? euro(trade.profit) : "–"} tone={trade.profit >= 0 ? "good" : "bad"} />
          <Row label={t("roi")} value={trade.priced ? pct(trade.roi) : "–"} />
          <p className="mt-2 text-xs leading-relaxed text-faint">{t("resale_note", { pct: pct(trade.resale_factor || 0.95) })}</p>
        </Card>
      )}

      {view === "personal" && personal && (
        <Card className="p-4 sm:p-5">
          <h3 className="mb-3 text-[15px] font-semibold">{t("what_to_offer")}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 p-3.5">
              <div className="text-xs text-muted">{t("offer_start")}</div>
              <div className="num mt-1 text-xl font-semibold">{euro(personal.offer_start)}</div>
            </div>
            <div className="rounded-xl border border-line p-3.5">
              <div className="text-xs text-muted">{t("offer_max")}</div>
              <div className="num mt-1 text-xl font-semibold">{euro(personal.offer_max)}</div>
            </div>
          </div>
          <h3 className="mb-1 mt-5 text-[15px] font-semibold">{t("first_year")}</h3>
          <Row label={`${t("fuel_year")} (${decimal(personal.consumption)} ${personal.energy_unit}/100 km)`} value={euro(personal.fuel_per_year)} />
          {personal.repairs > 0 && <Row label={t("repairs")} value={euro(personal.repairs)} />}
          {personal.hu_cost > 0 && <Row label={t("tuv_due")} value={euro(personal.hu_cost)} />}
          <Row label={t("inspection")} value={euro(personal.inspection_cost)} />
          {personal.trip_cost > 0 && <Row label={t("fuel_trip", { km: listing.distance_km ? `${listing.distance_km} km` : "" })} value={euro(personal.trip_cost)} />}
          <Row strong label={t("first_year_total")} value={euro(personal.first_year_cost)} />
          {ai?.reliability ? <Row label={t("reliability")} value={<Meter value={ai.reliability} />} /> : null}
          {ai?.yearly_upkeep_eur ? <Row label={t("upkeep")} value={euro(ai.yearly_upkeep_eur)} /> : null}
        </Card>
      )}
    </div>
  );
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
      <Card className="p-5">
        {analysis && !matches ? (
          <p className="text-sm text-muted">{t("ai_review_other", { purpose: t(result.analysis_kind === "trade" ? "purpose_trade_short" : "purpose_personal_short") })}</p>
        ) : (
          statusNote[result.ai_status] && (
            <Note tone="warn">
              {t(statusNote[result.ai_status]!)}
              {result.ai_status === "failed" && result.ai_error && <span className="mt-1 block">{t(`ai_reason_${result.ai_error}` as TextKey)}</span>}
            </Note>
          )
        )}
        <Button className="mt-4" variant="primary" loading={busy} disabled={!prefs.ai_enabled} onClick={onReview}>
          {t("ai_for_purpose")}
        </Button>
      </Card>
    );
  }
  const issues = result.costed_issues;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-4 sm:p-5 lg:col-span-2">
        <p className="text-[15px] leading-relaxed" dir="auto">
          {analysis.verdict_reason}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
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
        {analysis.scam_signals?.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-bad">
            {analysis.scam_signals.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <h3 className="mb-3 text-[15px] font-semibold">{t("issues")}</h3>
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-good">
            <CheckCircle2 className="size-4" /> {t("no_issues")}
          </p>
        ) : (
          <div className="divide-y divide-line">
            {issues.map((issue, i) => (
              <div key={i} className="py-2.5 first:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{issue.issue}</span>
                  <span className="num text-sm font-semibold">~{euro(issue.cost_eur)}</span>
                </div>
                <p className="mt-1 text-xs italic text-muted" dir="ltr">
                  “{issue.quote}”
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {analysis.known_weak_points && analysis.known_weak_points.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h3 className="text-[15px] font-semibold">{t("weak_points")}</h3>
          <p className="mb-3 text-xs text-muted">{t("weak_points_note")}</p>
          <div className="divide-y divide-line">
            {analysis.known_weak_points.map((point, i) => (
              <div key={i} className="py-2.5 first:pt-0">
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

      <ListCard title={t("positives")} items={analysis.positives} />
      {analysis.negatives && <ListCard title={t("negatives")} items={analysis.negatives} />}
      {analysis.inspection_checklist && <ListCard title={t("checklist")} items={analysis.inspection_checklist} />}
      <ListCard title={t("questions")} items={analysis.questions_for_seller} />

      {analysis.suitability && (
        <Card className="p-4 sm:p-5">
          <h3 className="mb-2 text-[15px] font-semibold">{t("suitability")}</h3>
          <p className="text-sm leading-relaxed text-muted">{analysis.suitability}</p>
        </Card>
      )}
      {analysis.negotiation_tip && (
        <Card className="p-4 sm:p-5">
          <h3 className="mb-2 text-[15px] font-semibold">{t("negotiation")}</h3>
          <p className="text-sm leading-relaxed text-muted">{analysis.negotiation_tip}</p>
        </Card>
      )}
      {analysis.seller_message && <SellerMessage text={analysis.seller_message} />}
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 text-[15px] font-semibold">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted" />
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
    <Card className="p-4 sm:p-5 lg:col-span-2">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold">{t("seller_message")}</h3>
        <Button size="sm" onClick={async () => (await copyText(text)) && toast(t("copied"), "good")}>
          {t("copy")}
        </Button>
      </div>
      <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-4 text-sm leading-relaxed" dir="ltr">
        {text}
      </p>
    </Card>
  );
}

/** How the market price came about: the comparable cars, the chart and the calculation. */
function Market({ result, view }: { result: Result; view: Purpose }) {
  const t = useT();
  const prefs = useStore(prefsStore);
  const { valuation, listing, trade, personal } = result;
  const [sort, setSort] = useState<"near" | "price" | "km">("near");
  const [showAll, setShowAll] = useState(false);
  const used = useMemo(() => {
    const list = [...valuation.used];
    if (sort === "price") list.sort((a, b) => a.adjusted - b.adjusted);
    if (sort === "km") list.sort((a, b) => a.km - b.km);
    return list;
  }, [valuation.used, sort]);
  const median = valuation.median ?? valuation.market_price;
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <h3 className="text-[15px] font-semibold">{t("compared_with")}</h3>
        <p className="mt-1 text-sm text-muted" dir="ltr">
          {valuation.basis}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={valuation.confidence === "high" ? "good" : valuation.confidence === "medium" ? "neutral" : "warn"}>
            {t("confidence")}: {t(`conf_${valuation.confidence}` as TextKey)}
          </Badge>
          {valuation.range && (
            <Badge tone="neutral">
              {t("typical_range")} <span className="num">{euro(valuation.range[0])}–{euro(valuation.range[1])}</span>
            </Badge>
          )}
        </div>
        <div className="mt-4 border-t border-line pt-3">
          <Row label={t("calc_median", { n: valuation.comparables })} value={euro(median)} />
          {valuation.local_factor && <Row label={t("calc_local", { pct: signedPct(valuation.local_factor - 1), n: valuation.local_ads })} value={`× ${decimal(valuation.local_factor)}`} />}
          <Row strong label={t("market_price")} value={euro(valuation.market_price)} />
          {view === "trade" && trade && trade.fuel_cost > 0 && (
            <Row label={<>{t("fuel")} = <Formula>{`${trade.trip_legs} × ${trade.trip_km} km × ${decimal(trade.consumption)} l/100 km × ${decimal(trade.fuel_price)} €/l`}</Formula></>} value={euro(trade.fuel_cost)} />
          )}
          {view === "trade" && trade?.priced && (
            <Row label={<>{t("calc_profit")}: <Formula>{`${euro(trade.resale_price)} − ${euro(trade.buy_price)} − ${euro(trade.total_costs)}`}</Formula></>} value={euro(trade.profit)} tone={trade.profit >= 0 ? "good" : "bad"} />
          )}
          {view === "personal" && personal && (
            <Row label={<>{t("fuel_year")} = <Formula>{`${number(prefs.annual_km)} km ÷ 100 × ${decimal(personal.consumption)} ${personal.energy_unit} × ${decimal(personal.energy_price)} €`}</Formula></>} value={euro(personal.fuel_per_year)} />
          )}
        </div>
        {valuation.comparables_url && (
          <a href={valuation.comparables_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
            {t("open_search")} <ExternalLink className="size-3.5" />
          </a>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <h3 className="text-[15px] font-semibold">{t("comps_chart")}</h3>
        <p className="text-xs text-muted">{t("adjusted")}</p>
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
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <span className="text-[15px] font-semibold">
            {t("tab_comps")} <span className="num font-normal text-muted">({used.length})</span>
          </span>
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
          {(showAll ? used : used.slice(0, 12)).map((comp, i) => (
            <a key={i} href={comp.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-surface-2 sm:px-5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium rtl:text-right" dir="auto">
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
        {used.length > 12 && !showAll && (
          <button onClick={() => setShowAll(true)} className="w-full cursor-pointer border-t border-line px-4 py-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text">
            {t("show_all", { n: used.length })}
          </button>
        )}
      </Card>
    </div>
  );
}

/** A calculation that reads left to right in every language. */
function Formula({ children }: { children: ReactNode }) {
  return <span className="num text-text">{children}</span>;
}
