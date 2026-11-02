import { AlertTriangle, ArrowLeft, ArrowRight, ClipboardPaste } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CarPhoto, CarRow } from "../components/CarCard";
import { JobProgress } from "../components/JobProgress";
import { PurposePicker } from "../components/PurposeSwitch";
import { ResultView } from "../components/ResultView";
import { Button, Card, Note } from "../components/ui";
import { ApiError, runJob } from "../lib/api";
import { euro } from "../lib/format";
import { type TextKey, useT } from "../lib/i18n";
import { type Route, href, navigate } from "../lib/router";
import { prefsStore, saveResult, savedStore, uiStore, useStore } from "../lib/store";
import type { Job, Result } from "../lib/types";

const AD_URL = /https?:\/\/(?:www\.)?kleinanzeigen\.de\/s-anzeige\/[^\s"'<>]+/i;

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

  const start = useCallback(async (target: string) => {
    const adUrl = extractAdUrl(target);
    if (!adUrl) {
      setError({ code: "bad_url" });
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
  }, []);

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

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("home_title")}</h1>
        <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-muted">{t("home_sub")}</p>
        <Card className="mt-5 p-4 sm:p-5">
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              start(url);
            }}
          >
            <div>
              <label htmlFor="ad-url" className="mb-2 block text-[13px] font-medium text-muted">
                {t("ad_link")}
              </label>
              <div className="relative" dir="ltr">
                <input
                  id="ad-url"
                  name="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://www.kleinanzeigen.de/s-anzeige/…"
                  inputMode="url"
                  autoComplete="off"
                  className="h-12 w-full rounded-xl border border-line bg-surface pl-3.5 pr-24 text-sm outline-none transition placeholder:text-faint focus:border-muted focus:ring-2 focus:ring-accent/10"
                />
                <button type="button" onClick={paste} className="absolute inset-y-1.5 right-1.5 flex cursor-pointer items-center gap-1 rounded-lg px-3 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text">
                  <ClipboardPaste className="size-3.5" /> {t("paste")}
                </button>
              </div>
            </div>
            <PurposePicker value={prefs.purpose} onChange={(purpose) => prefsStore.set((p) => ({ ...p, purpose }))} />
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={running}>
              {running ? t("analyzing") : t("analyze")}
            </Button>
          </form>
        </Card>
      </section>

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
            {error.code !== "bad_url" && (
              <Button size="sm" onClick={() => start(url)}>
                {t("retry")}
              </Button>
            )}
          </div>
        </Note>
      )}

      {!running && (
        <section>
          {recent.length > 0 ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{t("recent")}</h2>
                <a href={href("saved")} className="text-sm text-muted hover:text-text">
                  {t("see_all")}
                </a>
              </div>
              <Card className="divide-y divide-line px-4">
                {recent.map((car) => (
                  <CarRow key={car.id} result={car.result} favorite={car.favorite} onClick={() => navigate("analyze", car.id)} />
                ))}
              </Card>
            </>
          ) : (
            <>
              <h2 className="mb-3 text-sm font-semibold">{t("how_title")}</h2>
              <ol className="space-y-3">
                {(["how_1", "how_2", "how_3"] as const).map((key, i) => (
                  <li key={key} className="flex gap-3 text-sm leading-relaxed text-muted">
                    <span className="num grid size-6 shrink-0 place-items-center rounded-full border border-line text-xs font-semibold text-text">{i + 1}</span>
                    <span className="pt-0.5">{t(key)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}
    </div>
  );
}
