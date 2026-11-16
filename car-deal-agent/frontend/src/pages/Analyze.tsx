import { AlertTriangle, ArrowRight, BadgeCheck, BadgeEuro, BellRing, Camera, ChevronRight, ClipboardPaste, Columns3, Flame, Gauge, Lightbulb, Link2, ListChecks, Radar, ScanSearch, ShieldCheck, Sparkles, TrendingDown, Wrench } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CarPhoto, CarTile } from "../components/CarCard";
import { DeviceHint, useNeedsDevice } from "../components/DeviceHint";
import { ShareSetup } from "../components/ShareSetup";
import { JobProgress } from "../components/JobProgress";
import { ResultView } from "../components/ResultView";
import { CarScan, RadarSweep } from "../components/brand";
import { CountUp, Reveal, Stagger, StaggerItem } from "../components/motion";
import { PurposeSwitch } from "../components/PurposeSwitch";
import { Button, Card, type Hue, IconTile, Note, SectionTitle, cx } from "../components/ui";
import { ApiError, runJob } from "../lib/api";
import { useAiMarket, useApp } from "../lib/app";
import { euro, pct } from "../lib/format";
import { huntStore } from "../lib/hunt";
import { type TextKey, useT } from "../lib/i18n";
import { discountOf, isGood } from "../lib/result";
import { type Route, href, navigate } from "../lib/router";
import { prefsStore, saveResult, savedStore, uiStore, useStore } from "../lib/store";
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

const QUICK: { page: string; label: TextKey; sub: TextKey; hue: Hue; icon: ReactNode }[] = [
  { page: "hunt", label: "nav_hunt", sub: "nav_hunt_sub", hue: "accent", icon: <Radar className="size-5" /> },
  { page: "valuate", label: "nav_valuate", sub: "nav_valuate_sub", hue: "violet", icon: <Gauge className="size-5" /> },
  { page: "compare", label: "nav_compare", sub: "nav_compare_sub", hue: "cyan", icon: <Columns3 className="size-5" /> },
  { page: "tools", label: "nav_tools", sub: "nav_tools_sub", hue: "warn", icon: <Wrench className="size-5" /> },
  { page: "garage", label: "nav_garage", sub: "nav_garage_sub", hue: "good", icon: <BadgeEuro className="size-5" /> },
];

/** The start page: the hero with the link field, then what the account has checked so far, the
 *  shortcuts and the recent checks. */
export function AnalyzePage({ route }: { route: Route }) {
  const t = useT();
  const { meta } = useApp();
  const aiMarket = useAiMarket();
  const prefs = useStore(prefsStore);
  const saved = useStore(savedStore);
  const ui = useStore(uiStore);
  const [url, setUrl] = useState(route.query.get("url") ?? "");
  const [job, setJob] = useState<Job<Result> | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ code: string; [k: string]: unknown } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const started = useRef<string | null>(null);

  // A saved analysis opened from the list: #/analyze/<id>. Right after the app starts the saved
  // cars of the account may load a moment later, so this also runs when they arrive.
  useEffect(() => {
    if (!route.param) return;
    const car = saved.find((c) => c.id === route.param);
    if (car && result?.listing.id !== car.id) {
      setResult(car.result);
      setUrl(car.result.listing.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.param, saved]);

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
        // The progress was scrolled into view: the answer starts at the top.
        if (mounted.current) window.scrollTo({ top: 0 });
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
  // The progress sits below the form: bring it into view when a check starts.
  const progressBox = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (running) progressBox.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [running]);
  const preview = job?.partial?.listing as Result["listing"] | undefined;
  const recent = saved.slice(0, 8);

  const hunt = useStore(huntStore);

  // What this account has checked so far: how many, how many good ones, the best price found.
  const stats = useMemo(() => {
    const discounts = saved.map((car) => discountOf(car.result)).filter((d): d is number => d != null);
    return {
      checked: saved.length,
      good: saved.filter((car) => isGood(car.result, car.result.purpose)).length,
      best: discounts.length ? Math.max(...discounts) : null,
    };
  }, [saved]);

  if (result && !running) {
    return (
      <ResultView
        key={result.listing.id + result.created_at}
        result={result}
        onChange={setResult}
        onBack={reset}
        onReanalyze={result.listing.url ? () => (route.param ? navigate("analyze", null, { url: result.listing.url }) : start(result.listing.url)) : undefined}
      />
    );
  }

  const name = meta?.account?.name?.split(/[@\s]/)[0];
  const tip = (["tip_1", "tip_2", "tip_3", "tip_4"] as const)[new Date().getDate() % 4];

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* The hero: the one thing this page is for. Night blue in both themes. */}
      <Reveal y={16}>
        <section className="hero rounded-[28px] shadow-pop ring-1 ring-white/10 lg:rounded-[32px]">
          <span className="hero-grid" />
          <div className="pointer-events-none absolute -end-14 top-3 w-[64%] opacity-[0.22] sm:w-[46%] lg:hidden">
            <CarScan onDark still />
          </div>
          <div className="relative grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-10 lg:p-12">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15 backdrop-blur">
                <Sparkles className="size-3.5 text-[#7fe3ff]" />
                {name ? t("hello", { name }) : t("hero_badge")}
              </span>
              <h1 className="mt-3.5 text-[30px] font-bold leading-[1.08] sm:text-[40px] lg:text-[48px]">{t("hero_question")}</h1>
              <p className="mt-2.5 max-w-md text-[15px] leading-relaxed text-white/70 sm:text-base">{t("hero_line")}</p>

              <form
                className="mt-5 lg:mt-7"
                onSubmit={(event) => {
                  event.preventDefault();
                  start(url);
                }}
              >
                <label htmlFor="ad-url" className="sr-only">
                  {t("ad_link")}
                </label>
                <div className="relative" dir="ltr">
                  <Link2 className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[#8590a6]" />
                  <input
                    id="ad-url"
                    name="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder={t("ad_link")}
                    inputMode="url"
                    autoComplete="off"
                    className="h-14 w-full rounded-2xl border-0 bg-white pl-11 pr-28 text-[15px] text-[#0b1324] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] outline-none ring-0 transition placeholder:text-[#8590a6] focus:ring-4 focus:ring-[#7fe3ff]/45"
                  />
                  <button type="button" onClick={paste} className="absolute inset-y-2 right-2 flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#eef2ff] px-3 text-[13px] font-semibold text-[#2456f5] transition hover:bg-[#e0e7ff] active:scale-95">
                    <ClipboardPaste className="size-4" /> {t("paste")}
                  </button>
                </div>
                <div className="mt-3">
                  <PurposeSwitch compact onDark />
                  <p className="mt-2 min-h-[2.5em] text-[13px] leading-snug text-white/60">{t(prefs.purpose === "personal" ? "purpose_personal_hint" : "purpose_trade_hint")}</p>
                </div>
                <Button type="submit" variant="white" size="lg" className="mt-3 w-full" loading={running} icon={<ScanSearch className="size-5" />}>
                  {running ? t("analyzing") : t("analyze")}
                </Button>
              </form>
              <p className="mt-3.5 text-center text-xs text-white/50 lg:text-start">
                {t("works_with")} Kleinanzeigen · AutoScout24 · Autohero
              </p>
            </div>

            {/* Computer: the car under the scanner, and what the check covers. */}
            <div className="relative hidden lg:block">
              <CarScan onDark className="w-full" />
              <div className="mt-6 grid grid-cols-3 gap-2.5">
                {(
                  [
                    [aiMarket ? "trust_market_ai" : "trust_market", <TrendingDown key="i" className="size-4" />],
                    ["trust_risks", <ShieldCheck key="i" className="size-4" />],
                    ["trust_photos", <Camera key="i" className="size-4" />],
                  ] as const
                ).map(([key, icon]) => (
                  <div key={key} className="rounded-2xl bg-white/8 p-3 ring-1 ring-white/12 backdrop-blur">
                    <span className="grid size-8 place-items-center rounded-lg bg-white/12 text-[#7fe3ff]">{icon}</span>
                    <p className="mt-2 text-[13px] font-medium leading-snug text-white/85">{t(key)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Phone: the same three promises as one quiet line. */}
          <div className="relative flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3 text-[11.5px] font-medium text-white/70 sm:px-8 lg:hidden">
            {(
              [
                ["trust_market_short", <TrendingDown key="i" className="size-3.5" />],
                ["trust_risks_short", <ShieldCheck key="i" className="size-3.5" />],
                ["trust_photos_short", <Camera key="i" className="size-3.5" />],
              ] as const
            ).map(([key, icon]) => (
              <span key={key} className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-[#7fe3ff]">{icon}</span>
                <span className="truncate">{t(key)}</span>
              </span>
            ))}
          </div>
        </section>
      </Reveal>

      <DeviceHint />
      <ShareSetup />
      {meta?.hunt === false && !running && (
        <Reveal delay={0.1}>
          <div className="flex items-start gap-3.5 rounded-card border border-line bg-surface p-4 shadow-card">
            <IconTile hue="warn">
              <BellRing className="size-5" />
            </IconTile>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{t("alert_tip_title")}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t("alert_tip_text")}</p>
            </div>
          </div>
        </Reveal>
      )}

      {running && (
        <div ref={progressBox} className="scroll-mt-20">
          <JobProgress
            job={job}
            onCancel={() => {
              abort.current?.abort();
              setJob(null);
            }}
            extra={
              preview && (
                <div className="animate-fade-up mt-4 flex items-center gap-3 rounded-2xl bg-surface-2 p-2.5">
                  <CarPhoto src={preview.images?.[0] ?? ""} className="h-14 w-20 shrink-0 rounded-xl" />
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
        </div>
      )}

      {error && !running && (
        <Reveal>
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
        </Reveal>
      )}

      {!running && (
        <>
          {hunt.jobId && (
            <Reveal>
              <a href={href("hunt")} className="group flex items-center gap-4 rounded-card border border-accent/30 bg-accent/8 p-3.5 transition hover:bg-accent/12">
                <RadarSweep className="w-14" found={hunt.found.length} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{t("hunt_running")}</span>
                  <span className="block text-[13px] text-muted">{t("hunt_running_sub", { n: hunt.found.length })}</span>
                </span>
                <ChevronRight className="size-5 text-accent transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
              </a>
            </Reveal>
          )}

          {stats.checked > 0 && (
            <Stagger className="grid grid-cols-3 gap-2.5 sm:gap-4" delay={0.1}>
              <StaggerItem>
                <StatTile hue="accent" icon={<ListChecks className="size-[18px]" />} label={t("kpi_analyses")} value={<CountUp value={stats.checked} />} href={href("saved", null, { tab: "history" })} />
              </StaggerItem>
              <StaggerItem>
                <StatTile hue="good" icon={<Flame className="size-[18px]" />} label={t("kpi_good")} value={<CountUp value={stats.good} />} href={href("saved", null, { tab: "history", only: "good" })} />
              </StaggerItem>
              <StaggerItem>
                <StatTile
                  hue="violet"
                  icon={<TrendingDown className="size-[18px]" />}
                  label={t("stat_best_short")}
                  value={stats.best != null && stats.best > 0 ? <CountUp value={stats.best} format={(n) => pct(n)} /> : "–"}
                  href={href("saved", null, { tab: "history", sort: "discount" })}
                />
              </StaggerItem>
            </Stagger>
          )}

          <section>
            <SectionTitle>{t("quick_actions")}</SectionTitle>
            <Stagger className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4" delay={0.15}>
              {QUICK.filter((item) => (meta?.hunt === false ? item.page !== "hunt" : item.page !== "garage")).map((item) => (
                <StaggerItem key={item.page}>
                  <a href={href(item.page)} className="group flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-pop active:scale-[0.97]">
                    <span className="flex items-center justify-between">
                      <IconTile hue={item.hue}>{item.icon}</IconTile>
                      <ArrowRight className="size-4 text-faint transition duration-300 group-hover:translate-x-1 group-hover:text-accent rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                    </span>
                    <span>
                      <span className="block text-[15px] font-semibold leading-tight">{t(item.label)}</span>
                      <span className="mt-1 block text-[13px] leading-snug text-muted">{t(aiMarket && item.page === "hunt" ? "nav_hunt_sub_ai" : item.page === "valuate" && aiMarket ? "valuate_sub_ai" : item.sub)}</span>
                    </span>
                  </a>
                </StaggerItem>
              ))}
            </Stagger>
          </section>

          {recent.length > 0 ? (
            <section>
              <SectionTitle
                action={
                  <a href={href("saved")} className="flex items-center gap-1 text-sm font-semibold text-accent">
                    {t("see_all")} <ChevronRight className="size-4 rtl:rotate-180" />
                  </a>
                }
              >
                {t("recent")}
              </SectionTitle>
              {/* Phone: a row to swipe through. Wider screens: a grid. */}
              <Stagger className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4" delay={0.2}>
                {recent.map((car, index) => (
                  <StaggerItem key={car.id} className={cx("w-[72%] max-w-[280px] shrink-0 snap-start sm:w-auto sm:max-w-none", index >= 4 && "sm:hidden")}>
                    <CarTile result={car.result} favorite={car.favorite} onClick={() => navigate("analyze", car.id)} className="h-full w-full" />
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          ) : (
            <section>
              <SectionTitle>{t("how_title")}</SectionTitle>
              <Stagger className="grid gap-3 sm:grid-cols-3 sm:gap-4" delay={0.2}>
                {(
                  [
                    ["how_1", <Link2 key="i" className="size-5" />, "accent"],
                    ["how_2", <ClipboardPaste key="i" className="size-5" />, "violet"],
                    ["how_3", <BadgeCheck key="i" className="size-5" />, "good"],
                  ] as const
                ).map(([key, icon, hue], i) => (
                  <StaggerItem key={key}>
                    <Card className="relative h-full overflow-hidden p-4 sm:p-5">
                      <span className="num pointer-events-none absolute -top-3 end-3 text-[76px] font-bold leading-none text-surface-2">{i + 1}</span>
                      <IconTile hue={hue}>{icon}</IconTile>
                      <p className="relative mt-3 text-[15px] leading-relaxed">{t(key)}</p>
                    </Card>
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          )}

          {ui.tips && recent.length > 0 && (
            <Reveal delay={0.25}>
              <div className="bg-brand-soft flex items-start gap-3.5 rounded-card border border-accent/15 p-4">
                <IconTile hue="warn">
                  <Lightbulb className="size-5" />
                </IconTile>
                <div className="min-w-0">
                  <div className="eyebrow">{t("tip")}</div>
                  <p className="mt-0.5 text-[15px] leading-relaxed">{t(tip)}</p>
                </div>
              </div>
            </Reveal>
          )}
        </>
      )}
    </div>
  );
}

/** One figure about the account's checks; a tap opens the matching list. */
function StatTile({ icon, label, value, hue, href: target }: { icon: ReactNode; label: string; value: ReactNode; hue: Hue; href: string }) {
  return (
    <a href={target} className="flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-3.5 shadow-card transition duration-300 hover:-translate-y-0.5 hover:shadow-pop active:scale-[0.97] sm:p-4">
      <IconTile hue={hue} size="sm">
        {icon}
      </IconTile>
      <span className="text-[24px] font-bold leading-none tracking-tight sm:text-[28px]">{value}</span>
      <span className="text-xs leading-tight text-muted sm:text-[13px]">{label}</span>
    </a>
  );
}
