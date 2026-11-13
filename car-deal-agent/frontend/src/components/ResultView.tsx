import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeEuro,
  Calculator,
  CalendarClock,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Cog,
  Columns3,
  Expand,
  ExternalLink,
  Fuel,
  Gauge as GaugeIcon,
  HandCoins,
  Handshake,
  Heart,
  ListChecks,
  Loader2,
  Mail,
  MapPin,
  MessageCircleQuestion,
  Minus,
  MoreHorizontal,
  Printer,
  RefreshCw,
  Scale,
  ScatterChart,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  UserCheck,
  Wrench,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
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
import { Gauge, Meter, PriceRange, Scatter } from "./charts";
import { CountUp, EASE, Reveal, Stagger, StaggerItem } from "./motion";
import { Badge, Button, Card, Fold, type Hue, IconButton, IconTile, Modal, Note, Num, Row, Segmented, Tabs, type Tone, copyText, cx, useToast } from "./ui";

type Tab = "summary" | "ai" | "market" | "chat";

/** The answer for one car. Phone: photos, title and price, the verdict with its score and numbers,
 *  the facts, then tabs that stay at the top; "Save" and "Ad" float at the bottom. Computer: two
 *  columns, the verdict and the actions in a column at the side that stays in view. */
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

  const tabs: { value: Tab; label: string; icon?: ReactNode }[] = [
    { value: "summary", label: t("tab_summary") },
    { value: "ai", label: t("tab_ai"), icon: <Sparkles className="size-3.5 text-accent" /> },
    { value: "market", label: t("tab_market") },
    { value: "chat", label: t("tab_chat") },
  ];

  const menu: { label: string; icon: ReactNode; hue: Hue; onClick: () => void; hidden?: boolean }[] = [
    {
      label: inCompare ? t("in_compare") : t("to_compare"),
      icon: <Columns3 className="size-5" />,
      hue: "cyan",
      onClick: () => {
        if (!entry) saveResult(result);
        compareStore.set((ids) => (ids.includes(result.listing.id) ? ids.filter((id) => id !== result.listing.id) : [...ids, result.listing.id].slice(-4)));
        toast(inCompare ? t("removed") : t("added_compare"), "good");
      },
    },
    { label: t("to_garage"), icon: <BadgeEuro className="size-5" />, hue: "good", onClick: toGarage, hidden: noMarket },
    { label: t("reevaluate"), icon: <Calculator className="size-5" />, hue: "violet", onClick: () => evaluate(false), hidden: noMarket },
    { label: t("reanalyze"), icon: <RefreshCw className="size-5" />, hue: "accent", onClick: () => onReanalyze?.(), hidden: !onReanalyze || !result.listing.url },
    { label: t("print"), icon: <Printer className="size-5" />, hue: "neutral", onClick: () => window.print() },
  ];

  const saveButton = (
    <Button className="flex-1" variant={entry?.favorite ? "soft" : "secondary"} onClick={toggleFavorite} icon={<Heart key={String(entry?.favorite)} className={cx("size-[18px]", entry?.favorite && "animate-pop fill-[#e5484d] text-[#e5484d]")} />}>
      {entry?.favorite ? t("saved") : t("save")}
    </Button>
  );
  const adLink = result.listing.url ? (
    <a href={result.listing.url} target="_blank" rel="noopener noreferrer" className="bg-brand inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-[14px] px-4 text-sm font-medium text-white shadow-glow transition duration-200 hover:brightness-110 active:scale-[0.97]">
      <ExternalLink className="size-4 shrink-0" /> <span className="truncate">{t("the_ad")}</span>
    </a>
  ) : null;
  const iconActions = (
    <>
      <IconButton label={t("share")} onClick={share} className="bg-surface shadow-card ring-1 ring-line">
        <Share2 className="size-[18px]" />
      </IconButton>
      <IconButton label={t("nav_more")} onClick={() => setMenuOpen(true)} className="bg-surface shadow-card ring-1 ring-line">
        {busy === "recalc" ? <Loader2 className="size-[18px] animate-spin" /> : <MoreHorizontal className="size-[18px]" />}
      </IconButton>
    </>
  );

  return (
    <div>
      {/* Back to the empty form; on a phone share and more sit up here, next to it. */}
      <div className="no-print mb-3 flex min-h-10 items-center justify-between gap-2">
        {onBack ? (
          <button onClick={onBack} className="flex h-10 cursor-pointer items-center gap-1.5 rounded-full bg-surface pe-4 ps-3 text-sm font-medium text-muted shadow-card ring-1 ring-line transition hover:text-text active:scale-95">
            <Back className="size-4" /> {t("new_check")}
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2 lg:hidden">{iconActions}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_390px] lg:grid-rows-[auto_auto_auto_1fr] lg:gap-x-7 lg:gap-y-5">
        <Reveal className="lg:col-start-1 lg:row-start-1">
          <Gallery result={result} favorite={Boolean(entry?.favorite)} onFavorite={toggleFavorite} />
        </Reveal>
        <Reveal delay={0.05} className="lg:col-start-1 lg:row-start-2">
          <Heading result={result} />
        </Reveal>

        <aside className="min-w-0 lg:col-start-2 lg:row-span-4 lg:row-start-1">
          <Reveal delay={0.1} className="space-y-3 lg:sticky lg:top-8">
            {noMarket ? <NoMarket result={result} onReanalyze={onReanalyze} /> : <VerdictCard result={result} view={view} onView={setView} />}
            <div className="no-print hidden items-center gap-2 lg:flex">
              {saveButton}
              {adLink}
              <div className="flex shrink-0 items-center gap-2">{iconActions}</div>
            </div>
          </Reveal>
        </aside>

        <Reveal delay={0.15} className="lg:col-start-1 lg:row-start-3">
          <Facts result={result} />
        </Reveal>

        {!noMarket && (
          <section className="min-w-0 lg:col-start-1 lg:row-start-4">
            <div ref={tabBar} className="no-print sticky top-[var(--topbar)] z-20 -mx-4 bg-bg/85 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:mx-0 lg:rounded-b-2xl lg:px-0">
              <Tabs value={tab} onChange={changeTab} tabs={tabs} />
            </div>
            <motion.div key={tab} className="pt-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE }}>
              {tab === "summary" && <Summary result={result} view={view} />}
              {tab === "ai" && <AiReview result={result} view={view} busy={busy === "ai"} onReview={() => evaluate(true)} />}
              {tab === "market" && <Market result={result} view={view} />}
              {tab === "chat" && <ChatPanel result={result} />}
            </motion.div>
          </section>
        )}
      </div>

      {/* Phone: the two main actions float at the bottom, right above the tabs of the app (on
          <body>, so the page's fade-in does not hold the bar inside the page). */}
      {createPortal(
        <motion.div className="no-print pointer-events-none fixed inset-x-0 bottom-[var(--tabbar)] z-30 px-3 lg:hidden" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 380, damping: 32, delay: 0.25 }}>
          <div className="glass pointer-events-auto mx-auto flex max-w-md items-center gap-2 rounded-[22px] border border-line p-2 shadow-pop">
            {saveButton}
            {adLink}
          </div>
        </motion.div>,
        document.body,
      )}
      <div aria-hidden="true" className="h-16 lg:hidden" />

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title={t("nav_more")}>
        <div className="space-y-1">
          {menu
            .filter((item) => !item.hidden)
            .map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  setMenuOpen(false);
                  item.onClick();
                }}
                className="flex w-full cursor-pointer items-center gap-3.5 rounded-2xl p-2.5 text-start text-[15px] font-medium transition hover:bg-surface-2 active:scale-[0.98]"
              >
                <IconTile hue={item.hue}>{item.icon}</IconTile>
                {item.label}
              </button>
            ))}
        </div>
      </Modal>
    </div>
  );
}

/** The ad's photos, swiped with the finger (arrows and small pictures on a computer); a tap opens
 *  them full screen. The heart saves the car. */
function Gallery({ result, className, favorite, onFavorite }: { result: Result; className?: string; favorite: boolean; onFavorite: () => void }) {
  const t = useT();
  const ui = useStore(uiStore);
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const images = (result.listing.images ?? []).slice(0, 12);
  // A valuation without an ad has no photos: no empty picture either.
  if (images.length === 0) return null;
  const frame = "aspect-[16/10] w-full sm:aspect-[16/9] lg:aspect-[16/10]";
  if (!ui.showPhotos) return <CarPhoto src="" className={cx(frame, "rounded-[24px]", className)} />;

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
  const arrow = "absolute top-1/2 hidden size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/90 text-[#0b1324] opacity-0 shadow-lg backdrop-blur transition duration-200 hover:bg-white group-hover:opacity-100 disabled:hidden lg:grid";
  return (
    <div className={className}>
      <div className="group relative overflow-hidden rounded-[24px] bg-surface-2 shadow-card ring-1 ring-line">
        <div ref={strip} onScroll={onScroll} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
          {images.map((src, i) => (
            <button key={`${i}-${src.slice(-40)}`} type="button" onClick={() => setOpen(i)} className="w-full shrink-0 cursor-zoom-in snap-center snap-always" aria-label={`${t("photos_open")} ${i + 1}/${images.length}`}>
              <CarPhoto src={src} alt={i === 0 ? result.listing.title : ""} className={frame} />
            </button>
          ))}
        </div>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/45 to-transparent" />
        {images.length > 1 && (
          <>
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label={t("photo_prev")} className={cx(arrow, "start-3")}>
              <Prev className="size-5" />
            </button>
            <button type="button" onClick={() => go(index + 1)} disabled={index === images.length - 1} aria-label={t("photo_next")} className={cx(arrow, "end-3")}>
              <Next className="size-5" />
            </button>
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
              {images.map((_, i) => (
                <span key={i} className={cx("h-1.5 rounded-full transition-all duration-300", i === index ? "w-5 bg-white" : "w-1.5 bg-white/55")} />
              ))}
            </div>
          </>
        )}
        <button
          type="button"
          onClick={onFavorite}
          aria-label={t(favorite ? "remove_favorite" : "add_favorite")}
          aria-pressed={favorite}
          className="no-print absolute start-3 top-3 grid size-10 cursor-pointer place-items-center rounded-full bg-white/90 text-[#0b1324] shadow-lg backdrop-blur transition duration-200 hover:bg-white active:scale-90"
        >
          <Heart key={String(favorite)} className={cx("size-5", favorite && "animate-pop fill-[#e5484d] text-[#e5484d]")} />
        </button>
        <span className="num pointer-events-none absolute end-3 top-3 flex items-center gap-1.5 rounded-full bg-[#0b1324]/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
          <Expand className="size-3.5" /> {index + 1}/{images.length}
        </span>
      </div>
      {/* Computer: the first photos small, below. */}
      {images.length > 1 && (
        <div className="no-print mt-2.5 hidden gap-2 lg:flex">
          {images.slice(0, 7).map((src, i) => (
            <button key={i} type="button" onClick={() => go(i)} className={cx("relative h-16 flex-1 cursor-pointer overflow-hidden rounded-xl ring-2 transition duration-200", i === index ? "ring-accent" : "opacity-70 ring-transparent hover:opacity-100")} aria-label={`${i + 1}/${images.length}`}>
              <CarPhoto src={photoSize(src, 35)} className="size-full" />
            </button>
          ))}
        </div>
      )}
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
      <h1 className="text-[22px] font-bold leading-tight sm:text-[26px]">
        <bdi>{listing.title}</bdi>
      </h1>
      {listing.location && (
        <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
          <MapPin className="size-4 shrink-0 text-accent" />
          <span className="truncate">{place(listing.location)}</span>
          {listing.distance_km != null && (
            <span className="num shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium">{number(listing.distance_km)} km</span>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="num text-[34px] font-bold leading-none tracking-tight">{result.trade?.priced === false ? t("no_price") : euro(listing.price)}</span>
        <Badge tone="neutral" className="text-[13px]">
          {listing.negotiable ? t("negotiable") : t("fixed_price")}
        </Badge>
        {listing.damaged && <Badge tone="bad">{t("damaged")}</Badge>}
      </div>
    </div>
  );
}

/** Mileage, registration, power, fuel, gearbox, TÜV: six small cells, each with its icon. */
function Facts({ result, className }: { result: Result; className?: string }) {
  const t = useT();
  const { listing } = result;
  const facts: { label: TextKey; value: ReactNode; icon: ReactNode }[] = [
    { label: "mileage_short", icon: <GaugeIcon className="size-4" />, value: <span className="num">{km(listing.km)}</span> },
    { label: "first_reg_short", icon: <CalendarDays className="size-4" />, value: <span className="num">{registration(listing.month, listing.year)}</span> },
    { label: "power", icon: <Zap className="size-4" />, value: listing.power_ps ? <span className="num">{listing.power_ps} PS</span> : "–" },
    { label: "fuel", icon: <Fuel className="size-4" />, value: listing.fuel || "–" },
    { label: "gearbox", icon: <Cog className="size-4" />, value: listing.gearbox || "–" },
    {
      label: "tuv",
      icon: <ShieldCheck className="size-4" />,
      value: listing.hu_until ? <span className="num">{listing.hu_until}</span> : listing.flags?.includes("no_tuv") ? <span className="text-bad">{t("tuv_none")}</span> : <span className="text-faint">{t("tuv_unknown")}</span>,
    },
  ];
  return (
    <Stagger className={cx("grid grid-cols-3 gap-2 sm:gap-3", className)} gap={0.04}>
      {facts.map((fact) => (
        <StaggerItem key={fact.label}>
          <dl className="h-full rounded-2xl border border-line bg-surface p-3 shadow-card">
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <span className="shrink-0 text-accent">{fact.icon}</span>
              <span className="truncate">{t(fact.label)}</span>
            </dt>
            <dd className="mt-1.5 truncate text-sm font-semibold sm:text-[15px]">{fact.value}</dd>
          </dl>
        </StaggerItem>
      ))}
    </Stagger>
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

const GLOW: Record<Tone, string> = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", neutral: "var(--faint)", accent: "var(--accent)" };

/** The answer in one place: the score on a speedometer, verdict and reason, the three numbers that
 *  matter and where the price sits among the comparable cars. */
function VerdictCard({ result, view, onView }: { result: Result; view: Purpose; onView: (p: Purpose) => void }) {
  const t = useT();
  const verdict = verdictOf(result, view, t)!;
  const { valuation, trade, personal, listing } = result;
  const discount = discountOf(result);
  const ai = result.analysis && result.analysis_kind === view ? result.analysis : null;
  const reason = ai?.verdict_reason ?? verdict.reasons[0];
  return (
    <Card className="relative overflow-hidden">
      {/* A light in the verdict's colour behind the score. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-56 transition-colors duration-500" style={{ background: `radial-gradient(75% 100% at 50% 0%, color-mix(in srgb, ${GLOW[verdict.tone]} 16%, transparent), transparent)` }} />
      <div className="relative flex items-center justify-between gap-3 px-4 pt-3.5 sm:px-5">
        <span className="eyebrow">{t("result_for")}</span>
        <PurposeSwitch tiny value={view} onChange={onView} />
      </div>
      <div className="relative px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
        <Gauge key={view} score={verdict.score} tone={verdict.tone} label={t("score")} />
        <motion.div key={`${view}-${verdict.key}`} className="mt-3 text-center" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 0.5 }}>
          <div className={cx("text-[22px] font-bold leading-tight", toneText[verdict.tone])}>{verdict.label}</div>
          {reason && <p className="mx-auto mt-1.5 line-clamp-4 max-w-sm text-sm leading-relaxed text-muted">{isolateNumbers(reason)}</p>}
        </motion.div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label={t("market_price")} value={valuation.market_price} format={euro} sub={valuation.method === "ai" ? t("ai_estimate_short") : <><Num>{valuation.comparables}</Num> {t("comparables")}</>} />
          <Metric
            label={discount != null && discount < 0 ? t("above_market") : t("below_market")}
            value={discount == null ? null : Math.abs(discount)}
            format={(n) => pct(n)}
            tone={discount == null ? undefined : discount >= 0.05 ? "good" : discount <= -0.05 ? "bad" : undefined}
          />
          {view === "trade" && trade ? (
            <Metric label={t("profit")} value={trade.priced ? trade.profit : null} format={euro} tone={trade.profit >= 0 ? "good" : "bad"} sub={trade.priced ? <>{t("roi")} <Num>{pct(trade.roi)}</Num></> : undefined} />
          ) : personal ? (
            <Metric label={t("offer_max")} value={personal.offer_max} format={euro} sub={<>{t("offer_start")} <Num>{euro(personal.offer_start)}</Num></>} />
          ) : null}
        </div>
        {valuation.range && valuation.market_price && (
          <PriceRange
            low={valuation.range[0]}
            high={valuation.range[1]}
            market={valuation.market_price}
            price={trade?.priced === false ? null : listing.price}
            tone={discount == null ? "neutral" : discount >= 0.05 ? "good" : discount <= -0.05 ? "bad" : "neutral"}
            labels={{ market: t("market_price"), price: t("this_car") }}
          />
        )}
      </div>
    </Card>
  );
}

function Metric({ label, value, format, sub, tone }: { label: string; value: number | null; format: (n: number) => string; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl bg-surface-2/80 p-2.5 ring-1 ring-line sm:p-3">
      <div className="flex min-h-[2.4em] items-end text-[11.5px] leading-[1.2] text-muted">{label}</div>
      <div className={cx("mt-1 truncate text-[17px] font-bold tracking-tight", tone && toneText[tone])}>{value == null ? "–" : <CountUp value={value} format={format} />}</div>
      {sub && <div className="mt-0.5 text-[11px] leading-[1.25] text-faint">{sub}</div>}
    </div>
  );
}

/** A small count in the header of a closed card. */
function Count({ n }: { n: number }) {
  return <span className="num inline-grid h-5 min-w-5 place-items-center rounded-full bg-surface-2 px-1.5 text-xs font-semibold text-muted">{n}</span>;
}

/** Why the verdict, and the money in plain rows; each part opens and closes. */
function Summary({ result, view }: { result: Result; view: Purpose }) {
  const t = useT();
  const verdict = verdictOf(result, view, t)!;
  const { trade, personal, listing } = result;
  const ai = result.analysis_kind === "personal" ? result.analysis : null;
  return (
    <div className="space-y-3">
      <Fold title={t("why")} icon={<ListChecks className="size-4" />} hue="accent" summary={verdict.reasons.length > 0 ? <Count n={verdict.reasons.length} /> : undefined} defaultOpen>
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
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="num mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent/10 text-[11px] font-bold text-accent">{i + 1}</span>
                <span>{isolateNumbers(reason)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm font-medium text-good">
            <CheckCircle2 className="size-4" /> {t("no_objections")}
          </p>
        )}
      </Fold>

      {view === "trade" && trade && (
        <Fold title={t("money")} icon={<Calculator className="size-4" />} hue="good" summary={<span className={cx("num font-semibold", trade.priced && (trade.profit >= 0 ? "text-good" : "text-bad"))}>{t("profit")} {trade.priced ? euro(trade.profit) : "–"}</span>}>
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
          <Fold title={t("what_to_offer")} icon={<HandCoins className="size-4" />} hue="good" summary={<span className="num font-semibold text-text">{euro(personal.offer_start)} – {euro(personal.offer_max)}</span>} defaultOpen>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-brand-soft rounded-2xl p-3.5 ring-1 ring-accent/20">
                <div className="text-xs font-medium text-muted">{t("offer_start")}</div>
                <div className="num mt-1 text-[22px] font-bold tracking-tight text-accent">{euro(personal.offer_start)}</div>
              </div>
              <div className="rounded-2xl bg-surface-2 p-3.5 ring-1 ring-line">
                <div className="text-xs font-medium text-muted">{t("offer_max")}</div>
                <div className="num mt-1 text-[22px] font-bold tracking-tight">{euro(personal.offer_max)}</div>
              </div>
            </div>
          </Fold>
          <Fold title={t("first_year")} icon={<CalendarClock className="size-4" />} hue="violet" summary={<span className="num font-semibold text-text">{euro(personal.first_year_cost)}</span>}>
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
      <Card className="relative overflow-hidden p-5 text-center sm:p-7">
        <span className="bg-brand-soft pointer-events-none absolute inset-x-0 top-0 h-28" />
        <span className="bg-brand relative mx-auto grid size-14 place-items-center rounded-2xl text-white shadow-glow">
          <Sparkles className="size-7" />
        </span>
        <h3 className="relative mt-4 text-[17px] font-semibold">{t("tab_ai")}</h3>
        <div className="relative mx-auto mt-2 max-w-sm text-start">
          {analysis && !matches ? (
            <p className="text-center text-sm leading-relaxed text-muted">{t("ai_review_other", { purpose: t(result.analysis_kind === "trade" ? "purpose_trade_short" : "purpose_personal_short") })}</p>
          ) : (
            statusNote[result.ai_status] && (
              <Note tone="warn">
                {t(statusNote[result.ai_status]!)}
                {result.ai_status === "failed" && result.ai_error && <span className="mt-1 block">{t(`ai_reason_${result.ai_error}` as TextKey)}</span>}
              </Note>
            )
          )}
        </div>
        <Button className="relative mt-5" variant="primary" size="lg" loading={busy} disabled={!prefs.ai_enabled} onClick={onReview} icon={<Sparkles className="size-[18px]" />}>
          {t("ai_for_purpose")}
        </Button>
      </Card>
    );
  }
  const issues = result.costed_issues;
  const issueCost = issues.reduce((sum, issue) => sum + (issue.cost_eur || 0), 0);
  return (
    <div className="space-y-3">
      <Card className="relative overflow-hidden p-4 sm:p-5">
        <span className="bg-brand-soft pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative flex items-start gap-3.5">
          <span className="bg-brand grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-glow">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">{t("ai_summary")}</div>
            <p className="mt-1 text-[15px] leading-relaxed" dir="auto">
              {analysis.verdict_reason}
            </p>
          </div>
        </div>
        <div className="relative mt-3.5 flex flex-wrap gap-2">
          <Badge tone={analysis.scam_risk === "low" ? "good" : analysis.scam_risk === "medium" ? "warn" : "bad"} className="py-1">
            <ShieldAlert className="size-3.5" /> {t("scam")}: {t(`risk_${analysis.scam_risk}` as TextKey)}
          </Badge>
          {analysis.reliability != null && (
            <Badge tone="neutral" className="bg-surface py-1">
              {t("reliability")} <span className="num font-semibold text-text">{analysis.reliability}/5</span>
            </Badge>
          )}
          {analysis.resale_difficulty && (
            <Badge tone="neutral" className="bg-surface py-1">
              {t("resale_ease")}: <span className="font-semibold text-text">{t(`ease_${analysis.resale_difficulty}` as TextKey)}</span>
            </Badge>
          )}
        </div>
        {analysis.scam_signals?.length > 0 && (
          <ul className="relative mt-3 space-y-1.5 text-sm text-bad">
            {analysis.scam_signals.map((s, i) => (
              <li key={i} className="flex gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" /> <span>{s}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Fold title={t("issues")} icon={<Wrench className="size-4" />} hue="warn" summary={issues.length ? <span className="num font-semibold text-text">~{euro(issueCost)}</span> : <CheckCircle2 className="inline size-4 text-good" />} defaultOpen>
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 text-sm font-medium text-good">
            <CheckCircle2 className="size-4" /> {t("no_issues")}
          </p>
        ) : (
          <div className="space-y-2">
            {issues.map((issue, i) => (
              <div key={i} className="rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold">{issue.issue}</span>
                  <span className="num shrink-0 text-sm font-bold text-warn">~{euro(issue.cost_eur)}</span>
                </div>
                {issue.quote && (
                  <p className="mt-1 text-xs italic leading-relaxed text-muted" dir="ltr">
                    “{issue.quote}”
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Fold>

      <PhotoCheck result={result} analysis={analysis} />

      {analysis.known_weak_points && analysis.known_weak_points.length > 0 && (
        <Fold title={t("weak_points")} icon={<TriangleAlert className="size-4" />} hue="bad" summary={<Count n={analysis.known_weak_points.length} />}>
          <p className="mb-3 text-xs text-muted">{t("weak_points_note")}</p>
          <div className="space-y-2">
            {analysis.known_weak_points.map((point, i) => (
              <div key={i} className="rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold">{point.item}</span>
                  <span className="num shrink-0 text-xs font-medium text-muted">~{euro(point.typical_cost_eur)}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">{point.how_to_check}</p>
              </div>
            ))}
          </div>
        </Fold>
      )}

      <ListFold title={t("positives")} icon={<ThumbsUp className="size-4" />} hue="good" mark="plus" items={analysis.positives} />
      {analysis.negatives && <ListFold title={t("negatives")} icon={<ThumbsDown className="size-4" />} hue="bad" mark="minus" items={analysis.negatives} />}
      {analysis.inspection_checklist && <ListFold title={t("checklist")} icon={<ClipboardCheck className="size-4" />} hue="cyan" mark="box" items={analysis.inspection_checklist} />}
      <ListFold title={t("questions")} icon={<MessageCircleQuestion className="size-4" />} hue="violet" items={analysis.questions_for_seller} />

      {analysis.suitability && (
        <Fold title={t("suitability")} icon={<UserCheck className="size-4" />} hue="accent">
          <p className="text-sm leading-relaxed text-muted">{analysis.suitability}</p>
        </Fold>
      )}
      {analysis.negotiation_tip && (
        <Fold title={t("negotiation")} icon={<Handshake className="size-4" />} hue="good">
          <p className="text-sm leading-relaxed text-muted">{analysis.negotiation_tip}</p>
        </Fold>
      )}
      {analysis.seller_message && <SellerMessage text={analysis.seller_message} />}
    </div>
  );
}

const findingTone: Record<PhotoFinding["severity"], string> = { bad: "bg-bad", warn: "bg-warn", info: "bg-faint" };

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
      hue="cyan"
      summary={
        serious > 0 || odometerOff ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-warn">
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
        <p className="flex items-center gap-2 text-sm font-medium text-good">
          <CheckCircle2 className="size-4" /> {t("photo_nothing")}
        </p>
      ) : (
        <div className="space-y-2">
          {findings.map((finding, i) => {
            const index = result.photo_index?.[finding.photo - 1] ?? -1;
            const src = index >= 0 ? images[index] : undefined;
            return (
              <div key={i} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-2 ring-1 ring-line">
                {src ? (
                  <button type="button" onClick={() => setOpen(index)} className="relative size-14 shrink-0 cursor-zoom-in overflow-hidden rounded-xl" aria-label={t("photos_open")}>
                    <img src={photoSize(src, 2)} alt="" referrerPolicy="no-referrer" className="size-full object-cover transition-transform duration-300 hover:scale-110" />
                  </button>
                ) : (
                  <span className="num grid size-14 shrink-0 place-items-center rounded-xl bg-surface text-xs text-muted">{finding.photo}</span>
                )}
                <span className={cx("size-2 shrink-0 rounded-full", findingTone[finding.severity] ?? "bg-faint")} />
                <span className="min-w-0 text-sm leading-snug" dir="auto">
                  {finding.finding}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-faint">{t("photo_check_hint")}</p>
      {open != null && <Lightbox images={images} start={open} onClose={() => setOpen(null)} />}
    </Fold>
  );
}

function ListFold({ title, items, icon, hue, mark }: { title: string; items: string[]; icon?: ReactNode; hue?: Hue; mark?: "plus" | "minus" | "box" }) {
  if (!items?.length) return null;
  return (
    <Fold title={title} icon={icon} hue={hue} summary={<Count n={items.length} />}>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed">
            {mark === "plus" ? (
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-good/12 text-good">
                <Check className="size-3" strokeWidth={3} />
              </span>
            ) : mark === "minus" ? (
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-bad/12 text-bad">
                <Minus className="size-3" strokeWidth={3} />
              </span>
            ) : mark === "box" ? (
              <span className="mt-0.5 size-5 shrink-0 rounded-md border-2 border-line-strong" />
            ) : (
              <span className="num mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-bold text-muted">{i + 1}</span>
            )}
            <span dir="auto">{item}</span>
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
    <Fold title={t("seller_message")} icon={<Mail className="size-4" />} hue="accent">
      <p className="whitespace-pre-wrap rounded-2xl bg-surface-2 p-4 text-sm leading-relaxed ring-1 ring-line" dir="ltr">
        {text}
      </p>
      <Button size="sm" variant="primary" className="mt-3" onClick={async () => (await copyText(text)) && toast(t("copied"), "good")}>
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
  if (valuation.method === "ai") return <AiMarket result={result} />;
  return (
    <div className="space-y-3">
      <Fold title={t("compared_with")} icon={<Scale className="size-4" />} hue="accent" summary={<span className="num font-semibold text-text">{euro(valuation.market_price)}</span>}>
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
          <a href={valuation.comparables_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline">
            {t("open_search")} <ExternalLink className="size-3.5" />
          </a>
        )}
      </Fold>

      <Fold title={t("comps_chart")} icon={<ScatterChart className="size-4" />} hue="violet" defaultOpen>
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

      <Fold title={t("tab_comps")} icon={<Columns3 className="size-4" />} hue="cyan" summary={<Count n={used.length} />} flush>
        <div className="flex justify-end border-b border-line px-4 py-2.5 sm:px-5">
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
            <a key={i} href={comp.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface-2 sm:px-5">
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
          <button onClick={() => setShowAll(true)} className="w-full cursor-pointer border-t border-line px-4 py-3.5 text-sm font-semibold text-accent transition-colors hover:bg-surface-2">
            {t("show_all", { n: used.length })}
          </button>
        )}
      </Fold>
    </div>
  );
}

/** The market value as the AI estimated it (no comparable ads): the estimate, its range, what it
 *  rests on and how sure it is, and the advice to compare a few offers. */
function AiMarket({ result }: { result: Result }) {
  const t = useT();
  const { valuation, listing, trade } = result;
  const low = valuation.low ?? valuation.range?.[0];
  const high = valuation.high ?? valuation.range?.[1];
  return (
    <div className="space-y-3">
      <Card className="relative overflow-hidden p-4 sm:p-5">
        <span className="bg-brand-soft pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative flex items-start gap-3.5">
          <span className="bg-brand grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-glow">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">{t("market_estimate")}</div>
            <div className="num mt-1 text-[28px] font-bold leading-none tracking-tight">{euro(valuation.market_price)}</div>
            {low != null && high != null && (
              <p className="mt-1.5 text-sm text-muted">
                {t("estimate_range")} <Num className="font-semibold text-text">{euro(low)} – {euro(high)}</Num>
              </p>
            )}
          </div>
        </div>
        <div className="relative mt-3.5 flex flex-wrap gap-2">
          <Badge tone={valuation.confidence === "high" ? "good" : valuation.confidence === "medium" ? "neutral" : "warn"} className="py-1">
            {t("confidence")}: {t(`conf_${valuation.confidence}` as TextKey)}
          </Badge>
        </div>
        {valuation.basis && (
          <p className="relative mt-3 text-sm text-muted" dir="ltr">
            {valuation.basis}
          </p>
        )}
        {low != null && high != null && valuation.market_price && (
          <div className="relative">
            <PriceRange low={low} high={high} market={valuation.market_price} price={trade?.priced === false ? null : listing.price} labels={{ market: t("market_price"), price: t("this_car") }} />
          </div>
        )}
      </Card>
      <Note tone="warn" icon={<AlertTriangle className="size-4" />}>
        {t("market_ai_note")}
      </Note>
    </div>
  );
}

/** A calculation that reads left to right in every language. */
function Formula({ children }: { children: ReactNode }) {
  return <span className="num text-text">{children}</span>;
}
