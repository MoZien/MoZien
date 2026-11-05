import { AlertTriangle, ArrowLeft, ArrowRight, BadgeEuro, ChevronRight, ClipboardPaste, Columns3, FileSearch, Flame, Gauge, Heart, Home, Loader2, Radar, ScanSearch, TrendingDown } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CarPhoto } from "../components/CarCard";
import { DeviceHint, useNeedsDevice } from "../components/DeviceHint";
import { ShareSetup } from "../components/ShareSetup";
import { JobProgress } from "../components/JobProgress";
import { ResultView } from "../components/ResultView";
import { Button, Note, cx } from "../components/ui";
import { ApiError, runJob } from "../lib/api";
import { useApp } from "../lib/app";
import { euro, km, pct } from "../lib/format";
import { huntStore } from "../lib/hunt";
import { type TextKey, useT } from "../lib/i18n";
import { discountOf, isGood, photoOf, verdictOf } from "../lib/result";
import { type Route, href, navigate } from "../lib/router";
import { type SavedCar, prefsStore, saveResult, savedStore, uiStore, useStore } from "../lib/store";
import type { Job, Result } from "../lib/types";

// Ads from Kleinanzeigen, AutoScout24 (any of its country sites) and Autohero.
const AD_URL = /https?:\/\/(?:www\.)?(?:kleinanzeigen\.de\/s-anzeige\/|autoscout24\.[a-z.]{2,6}\/angebote\/|autohero\.com\/[a-z]{2}\/[^/\s]+\/id\/)[^\s"'<>]+/i;

export function extractAdUrl(text: string): string | null {
  return AD_URL.exec(text)?.[0].replace(/[.,;:!?)\]]+$/, "") ?? null;
}

export function errorText(t: (key: TextKey, params?: Record<string, string | number>) => string, error: { code: string; [k: string]: unknown }) {
  const key = `err_${error.code}` as TextKey;
  return t(key, { km: String(error.km ?? ""), message: String(error.message ?? "") });
}

/** The start page: paste a link, pick the purpose, see the answer; recent checks below. */
export function AnalyzePage({ route }: { route: Route }) {
  const t = useT();
  const prefs = useStore(prefsStore);
  const saved = useStore(savedStore);
  const [url, setUrl] = useState(route.query.get("url") ?? "");
  const [job, setJob] = useState<Job<Result> | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ code: string; [k: string]: unknown } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const started = useRef<string | null>(null);
  const Back = t.lang === "ar" ? ArrowRight : ArrowLeft;

  // A saved analysis opened from the list: #/analyze/<id>
  useEffect(() => {
    if (!route.param) return;
    const car = saved.find((c) => c.id === route.param);
    if (car) {
      setResult(car.result);
      setUrl(car.result.listing.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.param]);

  const needsDevice = useNeedsDevice();
  const start = useCallback(async (target: string) => {
    const adUrl = extractAdUrl(target);
    if (!adUrl) {
      setError({ code: "bad_url" });
      return;
    }
    if (needsDevice) {
      setError({ code: "needs_device" });
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setResult(null);
    setJob(null);
    window.scrollTo({ top: 0 });
    try {
      const done = await runJob<Result>("analyze", { url: adUrl, prefs: prefsStore.get() }, setJob, controller.signal);
      if (done.status === "done" && done.result) {
        setResult(done.result);
        if (uiStore.get().autoSave || !mounted.current) saveResult(done.result);
      } else if (done.error) {
        setError(done.error);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError({ code: err instanceof ApiError ? err.code : "server" });
    } finally {
      if (abort.current === controller) setJob(null);
    }
  }, [needsDevice]);

  // #/analyze?url=... starts right away (share target, bookmarklet, links from other pages).
  useEffect(() => {
    const fromQuery = route.query.get("url");
    if (fromQuery && started.current !== fromQuery && !route.param) {
      started.current = fromQuery;
      setUrl(fromQuery);
      start(fromQuery);
    }
  }, [route, start]);

  // Tapping "Check a car" again (plain #/analyze) goes back to the empty form.
  const firstRoute = useRef(true);
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    if (!route.param && !route.query.get("url") && job == null) {
      setResult(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // Leaving the page does not stop a running analysis: it finishes on the server and is saved,
  // so it shows up under the recent checks.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const onHome = () => {
      if (job == null) reset();
    };
    window.addEventListener("ah:home", onHome);
    return () => window.removeEventListener("ah:home", onHome);
  });

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(extractAdUrl(text) ?? text);
    } catch {
      /* clipboard not allowed: the user pastes by hand */
    }
  }

  function reset() {
    abort.current?.abort();
    setJob(null);
    setResult(null);
    setError(null);
    setUrl("");
    started.current = null;
    navigate("analyze");
  }

  const running = job != null;
  const preview = job?.partial?.listing as Result["listing"] | undefined;
  const recent = saved.slice(0, 5);

  const { meta } = useApp();
  const hunt = useStore(huntStore);
  const stats = useMemo(() => {
    let best: SavedCar | null = null;
    for (const car of saved) {
      const discount = discountOf(car.result);
      if (discount != null && discount > 0 && (best == null || discount > (discountOf(best.result) ?? 0))) best = car;
    }
    return {
      checked: saved.length,
      good: saved.filter((car) => isGood(car.result, car.result.purpose)).length,
      best: best ? discountOf(best.result) : null,
      bestId: best?.id ?? null,
    };
  }, [saved]);
  const Forward = t.lang === "ar" ? ArrowLeft : ArrowRight;

  if (result && !running) {
    return (
      <div className="space-y-4">
        <button onClick={reset} className="no-print flex cursor-pointer items-center gap-1.5 text-sm text-muted hover:text-text">
          <Back className="size-4" /> {t("new_check")}
        </button>
        <ResultView
          key={result.listing.id + result.created_at}
          result={result}
          onChange={setResult}
          onReanalyze={result.listing.url ? () => (route.param ? navigate("analyze", null, { url: result.listing.url }) : start(result.listing.url)) : undefined}
        />
      </div>
    );
  }

  const name = (meta?.account?.email || meta?.account?.name || "").split("@")[0].split(/[._-]/)[0];
  const hello = name ? t("hello", { name: name.charAt(0).toUpperCase() + name.slice(1) }) : t("hello_plain");

  return (
    <div className="space-y-7">
      {/* The start card: everything to check a car, in the brand colour */}
      <section className="relative overflow-hidden rounded-3xl bg-accent p-5 text-on-accent shadow-xl shadow-accent/25 sm:p-7">
        <HeroArt />
        <div className="relative">
          <p className="text-sm font-medium opacity-90">{hello}</p>
          <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight sm:text-3xl">{t("hero_question")}</h1>
          <p className="mt-1.5 max-w-md text-[15px] leading-relaxed opacity-90">{t("hero_line")}</p>
          <form
            className="mt-5 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              start(url);
            }}
          >
            <div className="relative" dir="ltr">
              <input
                id="ad-url"
                name="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={t("url_hint")}
                aria-label={t("ad_link")}
                inputMode="url"
                autoComplete="off"
                className="h-13 w-full rounded-2xl border-0 bg-white pl-4 pr-24 text-sm text-slate-900 shadow-lg shadow-black/10 outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-white/40"
              />
              <button type="button" onClick={paste} className="absolute inset-y-2 right-2 flex cursor-pointer items-center gap-1 rounded-xl bg-orange-50 px-3 text-xs font-semibold text-[#ff5a1f] hover:bg-orange-100">
                <ClipboardPaste className="size-3.5" /> {t("paste")}
              </button>
            </div>
            <div role="radiogroup" aria-label={t("purpose_question")} className="grid grid-cols-2 gap-1 rounded-2xl bg-black/15 p-1">
              {(["personal", "trade"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={prefs.purpose === value}
                  onClick={() => prefsStore.set((p) => ({ ...p, purpose: value }))}
                  className={cx(
                    "flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition",
                    prefs.purpose === value ? "bg-white text-slate-900 shadow" : "text-white/85 hover:text-white",
                  )}
                >
                  {value === "personal" ? <Home className="size-4" /> : <BadgeEuro className="size-4" />}
                  {t(value === "personal" ? "purpose_personal" : "purpose_trade")}
                </button>
              ))}
            </div>
            <p className="text-[13px] leading-relaxed opacity-90">{t(prefs.purpose === "personal" ? "purpose_personal_hint" : "purpose_trade_hint")}</p>
            <button
              type="submit"
              disabled={running}
              className="flex h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-900 text-[15px] font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-slate-800 active:scale-[0.99] disabled:opacity-70"
            >
              {running ? <Loader2 className="size-5 animate-spin" /> : <ScanSearch className="size-5" />}
              {running ? t("analyzing") : t("analyze")}
            </button>
          </form>
          <p className="mt-3 text-center text-xs opacity-85">
            {t("works_with")} <b>Kleinanzeigen</b> · <b>AutoScout24</b> · <b>Autohero</b>
          </p>
        </div>
      </section>

      <DeviceHint />
      <ShareSetup />

      {running && (
        <JobProgress
          job={job}
          onCancel={() => {
            abort.current?.abort();
            setJob(null);
          }}
          extra={
            preview && (
              <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                <CarPhoto src={preview.images?.[0] ?? ""} className="size-14 shrink-0 rounded-lg" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold rtl:text-right" dir="auto">
                    {preview.title}
                  </div>
                  <div className="num text-sm text-muted">{euro(preview.price)}</div>
                </div>
              </div>
            )
          }
        />
      )}

      {error && !running && (
        <Note tone="bad" icon={<AlertTriangle className="size-4" />}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorText(t, error)}</span>
            {error.code !== "bad_url" && error.code !== "needs_device" && (
              <Button size="sm" onClick={() => start(url)}>
                {t("retry")}
              </Button>
            )}
          </div>
        </Note>
      )}

      {!running && (
        <>
          {hunt.jobId && (
            <a href={href("hunt")} className="flex items-center gap-3 rounded-2xl border border-good/30 bg-good/8 p-4">
              <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-good text-white">
                <Radar className="size-5" />
                <span className="absolute inset-0 animate-ping rounded-xl bg-good/40" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{t("hunt_running")}</span>
                <span className="block text-sm text-muted">{t("hunt_running_sub", { n: hunt.found.length })}</span>
              </span>
              <Forward className="size-5 text-good" />
            </a>
          )}

          {stats.checked > 0 && (
            <section className="grid grid-cols-3 gap-2.5">
              <StatTile href={href("saved", null, { tab: "history" })} tint="bg-info/12 text-info" icon={<ScanSearch className="size-4" />} value={String(stats.checked)} label={t("stat_checked")} />
              <StatTile href={href("saved", null, { tab: "history", only: "good" })} tint="bg-good/12 text-good" icon={<Flame className="size-4" />} value={String(stats.good)} label={t("stat_good")} />
              <StatTile
                href={stats.bestId ? href("analyze", stats.bestId) : href("saved", null, { tab: "history", sort: "discount" })}
                tint="bg-accent/12 text-accent"
                icon={<TrendingDown className="size-4" />}
                value={stats.best == null ? "–" : pct(stats.best)}
                label={t("stat_best")}
              />
            </section>
          )}

          <section>
            <h2 className="mb-3 text-[15px] font-semibold">{t("quick_title")}</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <QuickTile href={href("hunt")} tint="bg-accent/12 text-accent" icon={<Radar className="size-5" />} label={t("qa_hunt")} />
              <QuickTile href={href("valuate")} tint="bg-info/12 text-info" icon={<Gauge className="size-5" />} label={t("qa_valuate")} />
              <QuickTile href={href("tools", null, { tool: "scan" })} tint="bg-violet/12 text-violet" icon={<FileSearch className="size-5" />} label={t("qa_scan")} />
              <QuickTile href={href("compare")} tint="bg-good/12 text-good" icon={<Columns3 className="size-5" />} label={t("qa_compare")} />
            </div>
          </section>

          {recent.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">{t("recent")}</h2>
                <a href={href("saved")} className="text-sm font-medium text-accent">
                  {t("see_all")}
                </a>
              </div>
              <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                {recent.map((car) => (
                  <RecentCard key={car.id} car={car} onClick={() => navigate("analyze", car.id)} />
                ))}
              </div>
            </section>
          ) : (
            <section>
              <h2 className="mb-3 text-[15px] font-semibold">{t("how_title")}</h2>
              <ol className="space-y-2.5">
                {(["how_1", "how_2", "how_3"] as const).map((key, i) => (
                  <li key={key} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 text-sm leading-relaxed">
                    <span className={cx("num grid size-8 shrink-0 place-items-center rounded-xl text-sm font-bold", ["bg-accent/12 text-accent", "bg-info/12 text-info", "bg-good/12 text-good"][i])}>{i + 1}</span>
                    <span className="pt-1">{t(key)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Road lines and a car outline behind the start card's text. */
function HeroArt() {
  return (
    <svg className="pointer-events-none absolute -top-3 end-0 h-28 w-48 opacity-[0.16]" viewBox="0 0 512 300" fill="none" stroke="white" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M126 192 L156 112 Q165 90 190 90 H322 Q347 90 356 112 L386 192" />
      <path d="M112 192 H400 Q414 192 414 206 V244 Q414 258 400 258 H112 Q98 258 98 244 V206 Q98 192 112 192 Z" />
      <path d="M150 258 V286 M362 258 V286" />
      <path d="M0 296 H80 M140 296 H240 M300 296 H400 M460 296 H512" strokeWidth="8" />
    </svg>
  );
}

/** A number on the start page; tapping it opens the cars behind it. */
function StatTile({ href: to, icon, value, label, tint }: { href: string; icon: ReactNode; value: string; label: string; tint: string }) {
  return (
    <a href={to} className="group block rounded-2xl border border-line bg-surface p-3 transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97]">
      <span className="flex items-start justify-between">
        <span className={cx("grid size-8 place-items-center rounded-lg", tint)}>{icon}</span>
        <ChevronRight className="size-4 text-faint transition group-hover:text-muted rtl:rotate-180" />
      </span>
      <span className="num mt-2 block text-xl font-bold leading-none">{value}</span>
      <span className="mt-1 block truncate text-xs text-muted">{label}</span>
    </a>
  );
}

function QuickTile({ href: to, icon, label, tint }: { href: string; icon: ReactNode; label: string; tint: string }) {
  return (
    <a href={to} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]">
      <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", tint)}>{icon}</span>
      <span className="text-[13px] font-semibold leading-snug">{label}</span>
    </a>
  );
}

const CHIP: Record<string, string> = { good: "bg-good text-white", warn: "bg-warn text-white", bad: "bg-bad text-white", neutral: "bg-slate-700 text-white", accent: "bg-accent text-white" };

/** A recent check as a photo card in the carousel. */
function RecentCard({ car, onClick }: { car: SavedCar; onClick: () => void }) {
  const t = useT();
  const verdict = verdictOf(car.result, car.result.purpose, t, true);
  const { listing } = car.result;
  return (
    <button onClick={onClick} className="w-56 shrink-0 cursor-pointer snap-start overflow-hidden rounded-2xl border border-line bg-surface text-start transition hover:shadow-md active:scale-[0.98]">
      <div className="relative">
        <CarPhoto src={photoOf(car.result)} className="h-32 w-full" />
        {verdict && <span className={cx("absolute start-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow", CHIP[verdict.tone])}>{verdict.label}</span>}
        {car.favorite && <Heart className="absolute end-2 top-2 size-5 fill-white text-white drop-shadow" />}
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-semibold rtl:text-right" dir="auto">
          {listing.title}
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="num text-base font-bold">{euro(listing.price)}</span>
          <span className="num truncate text-xs text-muted">{km(listing.km)}</span>
        </div>
      </div>
    </button>
  );
}
