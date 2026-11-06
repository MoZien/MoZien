import { AlertTriangle, ChevronRight, ClipboardPaste } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CarListRow, CarPhoto } from "../components/CarCard";
import { DeviceHint, useNeedsDevice } from "../components/DeviceHint";
import { ShareSetup } from "../components/ShareSetup";
import { JobProgress } from "../components/JobProgress";
import { ResultView } from "../components/ResultView";
import { Button, List, Note, Segmented } from "../components/ui";
import { ApiError, runJob } from "../lib/api";
import { euro } from "../lib/format";
import { huntStore } from "../lib/hunt";
import { type TextKey, useT } from "../lib/i18n";
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
  const recent = saved.slice(0, 4);

  const hunt = useStore(huntStore);

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

  return (
    <div className="space-y-5">
      {/* The whole form fits the first screen: a short headline, one line, the form. */}
      <section>
        <h1 className="text-[24px] font-semibold leading-tight lg:text-[32px]">{t("home_title")}</h1>
        <p className="mt-1 text-sm text-muted sm:text-[15px]">{t("home_sub")}</p>
        <form
          className="mt-4 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5"
          onSubmit={(event) => {
            event.preventDefault();
            start(url);
          }}
        >
          <label htmlFor="ad-url" className="mb-1.5 block text-[13px] font-medium">
            {t("ad_link")}
          </label>
          <div className="relative" dir="ltr">
            <input
              id="ad-url"
              name="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={t("url_hint")}
              inputMode="url"
              autoComplete="off"
              className="h-12 w-full rounded-[10px] border border-line-strong bg-surface pl-3.5 pr-28 text-[15px] outline-none transition placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/15"
            />
            <button type="button" onClick={paste} className="absolute inset-y-1.5 right-1.5 flex cursor-pointer items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium text-accent hover:bg-accent/8">
              <ClipboardPaste className="size-4" /> {t("paste")}
            </button>
          </div>
          <div className="mb-1.5 mt-3.5 text-[13px] font-medium">{t("purpose_question")}</div>
          <Segmented
            className="w-full"
            value={prefs.purpose}
            onChange={(purpose) => prefsStore.set((p) => ({ ...p, purpose }))}
            options={[
              { value: "personal", label: t("purpose_personal") },
              { value: "trade", label: t("purpose_trade") },
            ]}
          />
          <p className="mt-1.5 text-[13px] leading-snug text-muted">{t(prefs.purpose === "personal" ? "purpose_personal_hint" : "purpose_trade_hint")}</p>
          <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" loading={running}>
            {running ? t("analyzing") : t("analyze")}
          </Button>
        </form>
        <p className="mt-2.5 text-center text-xs text-faint">
          {t("works_with")} Kleinanzeigen · AutoScout24 · Autohero
        </p>
      </section>

      <DeviceHint />
      <ShareSetup />

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
              <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
                <CarPhoto src={preview.images?.[0] ?? ""} className="h-12 w-16 shrink-0 rounded-[8px]" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium rtl:text-right" dir="auto">
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
            <a href={href("hunt")} className="flex items-center gap-3.5 rounded-xl border border-line bg-surface px-4 py-3.5 transition hover:bg-surface-2">
              <span className="relative flex size-2.5 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/50" />
                <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{t("hunt_running")}</span>
                <span className="block text-[13px] text-muted">{t("hunt_running_sub", { n: hunt.found.length })}</span>
              </span>
              <ChevronRight className="size-4 text-faint rtl:rotate-180" />
            </a>
          )}

          {recent.length > 0 ? (
            <section>
              <div className="mb-2.5 flex items-baseline justify-between">
                <h2 className="text-[15px] font-semibold">{t("recent")}</h2>
                <a href={href("saved")} className="text-sm font-medium text-accent">
                  {t("see_all")}
                </a>
              </div>
              <List>
                {recent.map((car) => (
                  <CarListRow key={car.id} result={car.result} favorite={car.favorite} onClick={() => navigate("analyze", car.id)} />
                ))}
              </List>
            </section>
          ) : (
            <section>
              <h2 className="mb-3 text-[15px] font-semibold">{t("how_title")}</h2>
              <ol className="space-y-4">
                {(["how_1", "how_2", "how_3"] as const).map((key, i) => (
                  <li key={key} className="flex gap-3.5">
                    <span className="num grid size-7 shrink-0 place-items-center rounded-full border border-line-strong text-[13px] font-semibold text-muted">{i + 1}</span>
                    <span className="pt-0.5 text-[15px] leading-relaxed">{t(key)}</span>
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
