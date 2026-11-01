import { AlertTriangle, ClipboardPaste, ScanSearch, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CarPhoto } from "../components/CarCard";
import { JobProgress } from "../components/JobProgress";
import { PurposeCards } from "../components/PurposeSwitch";
import { ResultView } from "../components/ResultView";
import { Button, Card, Note, Toggle } from "../components/ui";
import { ApiError, runJob } from "../lib/api";
import { euro } from "../lib/format";
import { type TextKey, useT } from "../lib/i18n";
import { type Route, navigate } from "../lib/router";
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

export function AnalyzePage({ route }: { route: Route }) {
  const t = useT();
  const prefs = useStore(prefsStore);
  const ui = useStore(uiStore);
  const saved = useStore(savedStore);
  const [url, setUrl] = useState(route.query.get("url") ?? "");
  const [job, setJob] = useState<Job<Result> | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ code: string; [k: string]: unknown } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const started = useRef<string | null>(null);

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

  const start = useCallback(
    async (target: string) => {
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
      try {
        const done = await runJob<Result>("analyze", { url: adUrl, prefs: prefsStore.get() }, setJob, controller.signal);
        if (done.status === "done" && done.result) {
          setResult(done.result);
          if (uiStore.get().autoSave) saveResult(done.result);
        } else if (done.error) {
          setError(done.error);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError({ code: err instanceof ApiError ? err.code : "server" });
      } finally {
        if (abort.current === controller) setJob(null);
      }
    },
    [],
  );

  // #/analyze?url=... starts right away (dashboard, share target, bookmarklet).
  useEffect(() => {
    const fromQuery = route.query.get("url");
    if (fromQuery && started.current !== fromQuery && !route.param) {
      started.current = fromQuery;
      setUrl(fromQuery);
      start(fromQuery);
    }
  }, [route, start]);

  useEffect(() => () => abort.current?.abort(), []);

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      const found = extractAdUrl(text) ?? text;
      setUrl(found);
    } catch {
      /* clipboard not allowed: the user pastes by hand */
    }
  }

  const running = job != null;
  const preview = job?.partial?.listing as Result["listing"] | undefined;

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-accent/12 text-accent">
            <ScanSearch className="size-5" />
          </span>
          <h1 className="text-lg font-bold sm:text-xl">{t("nav_analyze")}</h1>
        </div>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            start(url);
          }}
        >
          <div className="relative flex-1" dir="ltr">
            <input
              name="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={t("url_placeholder")}
              className="h-12 w-full rounded-xl border border-line bg-surface-2/60 pl-4 pr-24 text-sm outline-none transition focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/10"
            />
            <button type="button" onClick={paste} className="absolute inset-y-1.5 right-1.5 flex cursor-pointer items-center gap-1 rounded-lg px-3 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text">
              <ClipboardPaste className="size-3.5" /> {t("paste")}
            </button>
          </div>
          <Button type="submit" variant="primary" size="lg" loading={running} icon={<Sparkles className="size-4" />}>
            {running ? t("analyzing") : t("analyze")}
          </Button>
        </form>
        <div className="mt-4">
          <PurposeCards value={prefs.purpose} onChange={(purpose) => prefsStore.set((p) => ({ ...p, purpose }))} />
        </div>
        <div className="mt-3 max-w-sm">
          <Toggle checked={prefs.ai_enabled} onChange={(ai_enabled) => prefsStore.set((p) => ({ ...p, ai_enabled }))} label={t("s_ai")} />
        </div>
      </Card>

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
                  <div className="truncate text-sm font-semibold" dir="auto">
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

      {result && !running && (
        <ResultView
          key={result.listing.id + result.created_at}
          result={result}
          onChange={setResult}
          onReanalyze={result.listing.url ? () => (route.param ? navigate("analyze", null, { url: result.listing.url }) : start(result.listing.url)) : undefined}
        />
      )}

      {!result && !running && !error && ui.tips && (
        <Note tone="accent" icon={<Sparkles className="size-4" />}>
          {t("hero_sub")}
        </Note>
      )}
    </div>
  );
}
