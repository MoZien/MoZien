import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeEuro,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Expand,
  ExternalLink,
  Heart,
  Camera,
  Loader2,
  MapPin,
  MoreHorizontal,
  Printer,
  RefreshCw,
  Share2,
  ShieldAlert,
} from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { decimal, euro, isolateNumbers, km, number, pct, place, registration, signedPct } from "../lib/format";
import { type TextKey, useT } from "../lib/i18n";
import { discountOf, shareText, verdictOf } from "../lib/result";
import { navigate } from "../lib/router";
import { compareStore, garageStore, prefsStore, saveResult, savedStore, uid, uiStore, updateSaved, useStore } from "../lib/store";
import { aiPhotoUrls, loadPhotos } from "../lib/photos";
import type { Analysis, PhotoFinding, Purpose, Result } from "../lib/types";
import { CarPhoto, toneText } from "./CarCard";
import { Lightbox, photoSize } from "./Lightbox";
import { ChatPanel } from "./ChatPanel";
import { PurposeSwitch } from "./PurposeSwitch";
import { Meter, PriceRange, Scatter } from "./charts";
import { Badge, Button, Card, Fold, IconButton, Modal, Note, Num, Row, Segmented, Tabs, type Tone, copyText, cx, useToast } from "./ui";

type Tab = "summary" | "ai" | "market" | "chat";

/** The answer for one car. Phone: photos, title and price, the verdict with its numbers, the facts,
 *  then tabs that stay at the top; "Save" and "Ad" stay at the bottom. Computer: two columns, the
 *  verdict and the actions in a column at the side that stays in view. */
export function ResultView({ result, onChange, onReanalyze, onBack }: { result: Result; onChange?: (r: Result) => void; onReanalyze?: () => void; onBack?: () => void }) {
  const t = useT();
  const prefs = useStore(prefsStore);
  const saved = useStore(savedStore);
  const compare = useStore(compareStore);
  const toast = useToast();
  const [view, setView] = useState<Purpose>(prefs.purpose);
  const [tab, setTab] = useState<Tab>("summary");
  const [busy, setBusy] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const tabBar = useRef<HTMLDivElement>(null);
  const entry = saved.find((car) => car.id === result.listing.id);
  const inCompare = compare.includes(result.listing.id);
  const noMarket = result.valuation.market_price == null;
  const Back = t.lang === "ar" ? ArrowRight : ArrowLeft;

  async function evaluate(withAi: boolean, purpose: Purpose = view) {
    setBusy(withAi ? "ai" : "recalc");
    try {
      // A new review looks at the photos too: this device loads them (the server never does).
      const photos = withAi && prefs.ai_photos ? await loadPhotos(aiPhotoUrls(result.listing.images)) : [];
      const next = await api<Result>("/api/evaluate", {
        body: { listing: result.listing, valuation: result.valuation, prefs: { ...prefs, purpose }, ai: withAi, photos },
      });
      // A recalculation keeps an earlier AI review of the other purpose if there is no new one.
      const merged = withAi || next.analysis
        ? next
        : { ...next, analysis: result.analysis, analysis_kind: result.analysis_kind, ai_status: result.ai_status, costed_issues: result.costed_issues, photos_checked: result.photos_checked, photo_index: result.photo_index };
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

  // Another tab while scrolled down: its start goes right under the tab bar, not to the page top.
  function changeTab(next: Tab) {
    setTab(next);
    const bar = tabBar.current;
    const section = bar?.parentElement;
    if (!bar || !section) return;
    const stuckAt = parseFloat(getComputedStyle(bar).top) || 0;
    const top = section.getBoundingClientRect().top;
    if (top < stuckAt) window.scrollBy({ top: top - stuckAt });
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

  const saveButton = (
    <Button className="flex-1" variant={entry?.favorite ? "primary" : "secondary"} onClick={toggleFavorite} icon={<Heart className={cx("size-4", entry?.favorite && "fill-current")} />}>
      {entry?.favorite ? t("saved") : t("save")}
    </Button>
  );
  const adLink = result.listing.url ? (
    <a href={result.listing.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-medium transition hover:bg-surface-2">
      <ExternalLink className="size-4 shrink-0" /> <span className="truncate">{t("the_ad")}</span>
    </a>
  ) : null;
  const iconActions = (
    <>
      <IconButton label={t("share")} onClick={share} className="size-10">
        <Share2 className="size-[18px]" />
      </IconButton>
      <IconButton label={t("nav_more")} onClick={() => setMenuOpen(true)} className="size-10">
        {busy === "recalc" ? <Loader2 className="size-[18px] animate-spin" /> : <MoreHorizontal className="size-[18px]" />}
      </IconButton>
    </>
  );

  return (
    <div className="animate-fade-up">
      {/* Back to the empty form; on a phone share and more sit up here, next to it. */}
      <div className="no-print mb-3 flex min-h-9 items-center justify-between gap-2">
        {onBack ? (
          <button onClick={onBack} className="-ms-1 flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] px-1 text-sm text-muted hover:text-text">
            <Back className="size-4" /> {t("new_check")}
          </button>
        ) : (
          <span />
        )}
        <div className="-me-2 flex items-center lg:hidden">{iconActions}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_auto_auto_1fr] lg:gap-x-6 lg:gap-y-5">
        <Gallery result={result} className="lg:col-start-1 lg:row-start-1" />
        <Heading result={result} className="lg:col-start-1 lg:row-start-2" />

        <aside className="min-w-0 lg:col-start-2 lg:row-span-4 lg:row-start-1">
          <div className="space-y-3 lg:sticky lg:top-8">
            {noMarket ? <NoMarket result={result} onReanalyze={onReanalyze} /> : <VerdictCard result={result} view={view} onView={setView} />}
            <div className="no-print hidden items-center gap-2 lg:flex">
              {saveButton}
              {adLink}
              <div className="-me-1 flex shrink-0 items-center">{iconActions}</div>
            </div>
          </div>
        </aside>

        <Facts result={result} className="lg:col-start-1 lg:row-start-3" />

        {!noMarket && (
          <section className="min-w-0 lg:col-start-1 lg:row-start-4">
            <div ref={tabBar} className="no-print sticky top-[var(--topbar)] z-20 -mx-4 bg-bg/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:mx-0 lg:px-0">
              <Tabs value={tab} onChange={changeTab} tabs={tabs} />
            </div>
            <div className="pt-4">
              {tab === "summary" && <Summary result={result} view={view} />}
              {tab === "ai" && <AiReview result={result} view={view} busy={busy === "ai"} onReview={() => evaluate(true)} />}
              {tab === "market" && <Market result={result} view={view} />}
              {tab === "chat" && <ChatPanel result={result} />}
            </div>
          </section>
        )}
      </div>

      {/* Phone: the two main actions stay at the bottom, right above the tabs of the app (on
          <body>, so the page's fade-in does not hold the bar inside the page). */}
      {createPortal(
        <div className="no-print fixed inset-x-0 bottom-[var(--tabbar)] z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-2">
            {saveButton}
            {adLink}
          </div>
        </div>,
        document.body,
      )}
      <div aria-hidden="true" className="h-14 lg:hidden" />

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

/** The ad's photos, swiped with the finger (arrows on a computer); a tap opens them full screen. */
function Gallery({ result, className }: { result: Result; className?: string }) {
  const t = useT();
  const ui = useStore(uiStore);
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const images = (result.listing.images ?? []).slice(0, 12);
  // A valuation without an ad has no photos: no empty picture either.
  if (images.length === 0) return null;
  const frame = "aspect-[2/1] w-full sm:aspect-[16/9] lg:aspect-[16/10]";
  if (!ui.showPhotos) return <CarPhoto src="" className={cx(frame, "rounded-xl", className)} />;

  const rtl = t.lang === "ar";
  const onScroll = () => {
    const el = strip.current;
    if (el) setIndex(Math.min(images.length - 1, Math.round(Math.abs(el.scrollLeft) / el.clientWidth)));
  };
  const go = (to: number) => {
    const el = strip.current;
    const next = Math.max(0, Math.min(images.length - 1, to));
    el?.scrollTo({ left: (rtl ? -1 : 1) * next * el.clientWidth, behavior: "smooth" });
  };
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;
  return (
    <div className={cx("group relative overflow-hidden rounded-xl bg-surface-2", className)}>
      <div ref={strip} onScroll={onScroll} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
        {images.map((src, i) => (
          <button key={`${i}-${src.slice(-40)}`} type="button" onClick={() => setOpen(i)} className="w-full shrink-0 cursor-zoom-in snap-center snap-always" aria-label={`${t("photos_open")} ${i + 1}/${images.length}`}>
            <CarPhoto src={src} alt={i === 0 ? result.listing.title : ""} className={frame} />
          </button>
        ))}
      </div>
      {images.length > 1 && (
        <>
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label={t("photo_prev")} className="absolute start-2 top-1/2 hidden size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100 disabled:hidden lg:grid">
            <Prev className="size-5" />
          </button>
          <button type="button" onClick={() => go(index + 1)} disabled={index === images.length - 1} aria-label={t("photo_next")} className="absolute end-2 top-1/2 hidden size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100 disabled:hidden lg:grid">
            <Next className="size-5" />
          </button>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5 lg:hidden">
            {images.map((_, i) => (
              <span key={i} className={cx("size-1.5 rounded-full transition", i === index ? "bg-white" : "bg-white/45")} />
            ))}
          </div>
        </>
      )}
      <span className="num pointer-events-none absolute end-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
        <Expand className="size-3.5" /> {index + 1}/{images.length}
      </span>
      {open != null && <Lightbox images={images} start={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Title, where the car is, and the asking price. */
function Heading({ result, className }: { result: Result; className?: string }) {
  const t = useT();
  const { listing } = result;
  return (
    <div className={cx("min-w-0", className)}>
      <h1 className="text-[19px] font-semibold leading-snug sm:text-[22px]">
        <bdi>{listing.title}</bdi>
      </h1>
      {listing.location && (
        <div className="mt-1 flex items-center gap-1 text-[13px] text-muted">
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
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="num text-[26px] font-semibold leading-none tracking-tight">{result.trade?.priced === false ? t("no_price") : euro(listing.price)}</span>
        <span className="text-sm text-muted">{listing.negotiable ? t("negotiable") : t("fixed_price")}</span>
        {listing.damaged && <Badge tone="bad">{t("damaged")}</Badge>}
      </div>
    </div>
  );
}

/** Mileage, registration, power, fuel, gearbox, TÜV: six small cells. */
function Facts({ result, className }: { result: Result; className?: string }) {
  const t = useT();
  const { listing } = result;
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
    <Card className={cx("px-4 py-3.5 sm:px-5", className)}>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-3 text-sm">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="truncate text-xs text-faint">{t(fact.label)}</dt>
            <dd className="truncate font-medium">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function NoMarket({ result, onReanalyze }: { result: Result; onReanalyze?: () => void }) {
  const t = useT();
  return (
    <Card className="p-4 sm:p-5">
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

/** The answer in one place: verdict and reason, the score, the three numbers that matter and
 *  where the price sits among the comparable cars. */
function VerdictCard({ result, view, onView }: { result: Result; view: Purpose; onView: (p: Purpose) => void }) {
  const t = useT();
  const verdict = verdictOf(result, view, t)!;
  const { valuation, trade, personal, listing } = result;
  const discount = discountOf(result);
  const ai = result.analysis && result.analysis_kind === view ? result.analysis : null;
  const reason = ai?.verdict_reason ?? verdict.reasons[0];
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 sm:px-5">
        <span className="eyebrow">{t("result_for")}</span>
        <PurposeSwitch tiny value={view} onChange={onView} />
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className={cx("flex items-center gap-2.5 text-[20px] font-semibold leading-tight", toneText[verdict.tone])}>
              <span className={cx("size-2.5 shrink-0 rounded-full", DOT[verdict.tone])} />
              {verdict.label}
            </div>
            {reason && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted">{isolateNumbers(reason)}</p>}
          </div>
          <ScoreRing score={verdict.score} tone={verdict.tone} label={t("score")} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3.5">
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
      </div>
    </Card>
  );
}

const DOT: Record<Tone, string> = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", neutral: "bg-faint", accent: "bg-accent" };
const RING: Record<Tone, string> = { good: "stroke-good", warn: "stroke-warn", bad: "stroke-bad", neutral: "stroke-faint", accent: "stroke-accent" };

/** The score (0–100) as a ring with its number, like a credit score. */
function ScoreRing({ score, tone, label }: { score: number; tone: Tone; label: string }) {
  const r = 22;
  const length = 2 * Math.PI * r;
  return (
    <div className="flex shrink-0 flex-col items-center" title={`${label}: ${score}/100`}>
      <div className="relative size-14">
        <svg viewBox="0 0 52 52" className="size-14 -rotate-90">
          <circle cx="26" cy="26" r={r} fill="none" className="stroke-line" strokeWidth="4" />
          <circle cx="26" cy="26" r={r} fill="none" className={cx(RING[tone], "transition-all duration-700")} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(Math.max(2, score) / 100) * length} ${length}`} />
        </svg>
        <span className="num absolute inset-0 grid place-items-center text-[15px] font-semibold">{score}</span>
      </div>
      <span className="mt-1 text-[11px] text-faint">{label}</span>
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[12px] text-muted">{label}</div>
      <div className={cx("num mt-1 truncate text-[17px] font-semibold", tone && toneText[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] leading-snug text-faint">{sub}</div>}
    </div>
  );
}

/** A small count in the header of a closed card. */
function Count({ n }: { n: number }) {
  return <span className="num inline-grid h-5 min-w-5 place-items-center rounded-full bg-surface-2 px-1.5 text-xs font-medium text-muted">{n}</span>;
}

/** Why the verdict, and the money in plain rows; each part opens and closes. */
function Summary({ result, view }: { result: Result; view: Purpose }) {
  const t = useT();
  const verdict = verdictOf(result, view, t)!;
  const { trade, personal, listing } = result;
  const ai = result.analysis_kind === "personal" ? result.analysis : null;
  return (
    <div className="space-y-3">
      <Fold title={t("why")} summary={verdict.reasons.length > 0 ? <Count n={verdict.reasons.length} /> : undefined} defaultOpen>
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
      </Fold>

      {view === "trade" && trade && (
        <Fold title={t("money")} summary={<span className={cx("num font-medium", trade.priced && (trade.profit >= 0 ? "text-good" : "text-bad"))}>{t("profit")} {trade.priced ? euro(trade.profit) : "–"}</span>}>
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
        </Fold>
      )}

      {view === "personal" && personal && (
        <>
          <Fold title={t("what_to_offer")} summary={<span className="num">{euro(personal.offer_start)} – {euro(personal.offer_max)}</span>}>
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
          </Fold>
          <Fold title={t("first_year")} summary={<span className="num">{euro(personal.first_year_cost)}</span>}>
            <Row label={`${t("fuel_year")} (${decimal(personal.consumption)} ${personal.energy_unit}/100 km)`} value={euro(personal.fuel_per_year)} />
            {personal.repairs > 0 && <Row label={t("repairs")} value={euro(personal.repairs)} />}
            {personal.hu_cost > 0 && <Row label={t("tuv_due")} value={euro(personal.hu_cost)} />}
            <Row label={t("inspection")} value={euro(personal.inspection_cost)} />
            {personal.trip_cost > 0 && <Row label={t("fuel_trip", { km: listing.distance_km ? `${listing.distance_km} km` : "" })} value={euro(personal.trip_cost)} />}
            <Row strong label={t("first_year_total")} value={euro(personal.first_year_cost)} />
            {ai?.reliability ? <Row label={t("reliability")} value={<Meter value={ai.reliability} />} /> : null}
            {ai?.yearly_upkeep_eur ? <Row label={t("upkeep")} value={euro(ai.yearly_upkeep_eur)} /> : null}
          </Fold>
        </>
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
      <Card className="p-4 sm:p-5">
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
  const issueCost = issues.reduce((sum, issue) => sum + (issue.cost_eur || 0), 0);
  return (
    <div className="space-y-3">
      <Card className="p-4 sm:p-5">
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

      <Fold title={t("issues")} summary={issues.length ? <span className="num">~{euro(issueCost)}</span> : undefined} defaultOpen>
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
      </Fold>

      <PhotoCheck result={result} analysis={analysis} />

      {analysis.known_weak_points && analysis.known_weak_points.length > 0 && (
        <Fold title={t("weak_points")} summary={<Count n={analysis.known_weak_points.length} />}>
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
        </Fold>
      )}

      <ListFold title={t("positives")} items={analysis.positives} />
      {analysis.negatives && <ListFold title={t("negatives")} items={analysis.negatives} />}
      {analysis.inspection_checklist && <ListFold title={t("checklist")} items={analysis.inspection_checklist} />}
      <ListFold title={t("questions")} items={analysis.questions_for_seller} />

      {analysis.suitability && (
        <Fold title={t("suitability")}>
          <p className="text-sm leading-relaxed text-muted">{analysis.suitability}</p>
        </Fold>
      )}
      {analysis.negotiation_tip && (
        <Fold title={t("negotiation")}>
          <p className="text-sm leading-relaxed text-muted">{analysis.negotiation_tip}</p>
        </Fold>
      )}
      {analysis.seller_message && <SellerMessage text={analysis.seller_message} />}
    </div>
  );
}

const findingTone: Record<PhotoFinding["severity"], string> = { bad: "bg-bad", warn: "bg-warn", info: "bg-muted" };

/** What the AI saw in the ad's photos: each finding next to its photo (tap: full screen), and the
 *  mileage on the dashboard against the ad's. Hidden for reviews without photos. */
function PhotoCheck({ result, analysis }: { result: Result; analysis: Analysis }) {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);
  const checked = result.photos_checked ?? 0;
  if (!checked) return null;
  const images = result.listing.images ?? [];
  const order: Record<PhotoFinding["severity"], number> = { bad: 0, warn: 1, info: 2 };
  const findings = [...(analysis.photo_findings ?? [])].sort((a, b) => order[a.severity] - order[b.severity]);
  const odometer = analysis.odometer_km_in_photo;
  const adKm = result.listing.km;
  const odometerOff = odometer != null && adKm != null && Math.abs(odometer - adKm) > Math.max(5_000, adKm * 0.1);
  const serious = findings.filter((f) => f.severity !== "info").length;
  return (
    <Fold
      title={t("photo_check")}
      icon={<Camera className="size-4" />}
      summary={
        serious > 0 || odometerOff ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-warn">
            <span className="size-2 rounded-full bg-warn" />
            <Num>{serious + (odometerOff ? 1 : 0)}</Num>
          </span>
        ) : (
          <CheckCircle2 className="inline size-4 text-good" />
        )
      }
      defaultOpen={serious > 0 || odometerOff}
    >
      <p className="mb-3 text-xs text-muted">{t("photo_check_note", { n: checked })}</p>
      {odometer != null && adKm != null && (
        <div className="mb-3">
          <Note tone={odometerOff ? "warn" : "good"}>
            {t(odometerOff ? "odometer_differs" : "odometer_matches", { photo: km(odometer), ad: km(adKm) })}
          </Note>
        </div>
      )}
      {findings.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-good">
          <CheckCircle2 className="size-4" /> {t("photo_nothing")}
        </p>
      ) : (
        <div className="divide-y divide-line">
          {findings.map((finding, i) => {
            const index = result.photo_index?.[finding.photo - 1] ?? -1;
            const src = index >= 0 ? images[index] : undefined;
            return (
              <div key={i} className="flex items-center gap-3 py-2.5 first:pt-0">
                {src ? (
                  <button type="button" onClick={() => setOpen(index)} className="size-12 shrink-0 cursor-zoom-in overflow-hidden rounded-md bg-surface-2" aria-label={t("photos_open")}>
                    <img src={photoSize(src, 2)} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
                  </button>
                ) : (
                  <span className="num grid size-12 shrink-0 place-items-center rounded-md bg-surface-2 text-xs text-muted">{finding.photo}</span>
                )}
                <span className={cx("size-2 shrink-0 rounded-full", findingTone[finding.severity] ?? "bg-muted")} />
                <span className="min-w-0 text-sm leading-snug" dir="auto">
                  {finding.finding}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-faint">{t("photo_check_hint")}</p>
      {open != null && <Lightbox images={images} start={open} onClose={() => setOpen(null)} />}
    </Fold>
  );
}

function ListFold({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <Fold title={title} summary={<Count n={items.length} />}>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted" />
            {item}
          </li>
        ))}
      </ul>
    </Fold>
  );
}

function SellerMessage({ text }: { text: string }) {
  const t = useT();
  const toast = useToast();
  return (
    <Fold title={t("seller_message")}>
      <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-4 text-sm leading-relaxed" dir="ltr">
        {text}
      </p>
      <Button size="sm" className="mt-3" onClick={async () => (await copyText(text)) && toast(t("copied"), "good")}>
        {t("copy")}
      </Button>
    </Fold>
  );
}

/** How the market price came about: the calculation, the chart and the comparable cars. */
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
    <div className="space-y-3">
      <Fold title={t("compared_with")} summary={<span className="num font-medium text-text">{euro(valuation.market_price)}</span>}>
        <p className="text-sm text-muted" dir="ltr">
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
      </Fold>

      <Fold title={t("comps_chart")} defaultOpen>
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
      </Fold>

      <Fold title={t("tab_comps")} summary={<Count n={used.length} />} flush>
        <div className="flex justify-end border-b border-line px-4 py-2 sm:px-5">
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
      </Fold>
    </div>
  );
}

/** A calculation that reads left to right in every language. */
function Formula({ children }: { children: ReactNode }) {
  return <span className="num text-text">{children}</span>;
}
