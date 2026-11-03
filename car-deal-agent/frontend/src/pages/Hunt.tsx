import { AlertTriangle, Bookmark, CheckCircle2, Coffee, RotateCcw, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { CarCard } from "../components/CarCard";
import { PurposeSwitch } from "../components/PurposeSwitch";
import { Button, Card, Disclosure, Field, Input, Note, NumberInput, Select, Toggle } from "../components/ui";
import { useApp } from "../lib/app";
import { useT } from "../lib/i18n";
import { navigate } from "../lib/router";
import { huntStore, startHunt, stopHunt } from "../lib/hunt";
import { createScopedStore, prefsStore, saveResult, searchesStore, seenStore, uid, useStore } from "../lib/store";
import type { HuntCriteria } from "../lib/types";
import { errorText } from "./Analyze";

export const DEFAULT_CRITERIA: HuntCriteria = {
  max_price: 3000, min_price: 500, min_year: 2002, max_year: null, min_km: null, max_km: 200000, zip_code: "06108",
  radius_km: 200, seller: "privat", make: null, query: "", fuel: null, gearbox: null, body_type: null,
  exclude_places: ["Berlin"], count: 3, max_ads: 15, pages: 2,
};
const criteriaStore = createScopedStore<HuntCriteria>("ah.hunt", DEFAULT_CRITERIA);
const skipStore = createScopedStore<boolean>("ah.huntSkip", true);

export function HuntPage() {
  const t = useT();
  const { meta } = useApp();
  const prefs = useStore(prefsStore);
  const criteria = useStore(criteriaStore);
  const skipSeen = useStore(skipStore);
  const searches = useStore(searchesStore);
  const seen = useStore(seenStore);
  const hunt = useStore(huntStore);
  const [placesText, setPlacesText] = useState(criteria.exclude_places.join(", "));
  const set = (patch: Partial<HuntCriteria>) => criteriaStore.set((c) => ({ ...c, ...patch }));

  function start() {
    const body = {
      criteria: { ...criteria, exclude_places: placesText.split(",").map((p) => p.trim()).filter(Boolean), skip_ids: skipSeen ? seen.slice(0, 2000) : [] },
      prefs,
    };
    startHunt(body);
  }

  const { job, found, summary, error } = hunt;
  const running = hunt.jobId != null;
  const progress = job?.progress ?? {};
  const makes = Object.entries(meta?.makes ?? {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("hunt_title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("hunt_sub")}</p>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <PurposeSwitch />
          {searches.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{t("saved_searches")}:</span>
              {searches.map((search) => (
                <span key={search.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 ps-3 text-xs">
                  <button className="cursor-pointer py-1 font-medium" onClick={() => { criteriaStore.set(search.criteria); setPlacesText(search.criteria.exclude_places.join(", ")); }}>
                    {search.name}
                  </button>
                  <button aria-label={t("delete")} className="cursor-pointer px-2 py-1 text-faint hover:text-bad" onClick={() => searchesStore.set((list) => list.filter((s) => s.id !== search.id))}>
                    <Trash2 className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          <Field label={t("budget")}>
            <NumberInput value={criteria.max_price} onChange={(v) => set({ max_price: v })} suffix="€" allowEmpty />
          </Field>
          <Field label={t("year_from")}>
            <NumberInput value={criteria.min_year} onChange={(v) => set({ min_year: v })} allowEmpty />
          </Field>
          <Field label={t("km_max")}>
            <NumberInput value={criteria.max_km} onChange={(v) => set({ max_km: v })} suffix="km" allowEmpty />
          </Field>
          <Field label={t("zip")}>
            <Input value={criteria.zip_code ?? ""} onChange={(e) => set({ zip_code: e.target.value.replace(/\D/g, "").slice(0, 5) || null })} inputMode="numeric" className="num" />
          </Field>
          <Field label={t("radius")}>
            <Select value={criteria.radius_km ?? 200} onChange={(e) => set({ radius_km: Number(e.target.value) })}>
              {[10, 20, 50, 100, 150, 200, 300, 500].map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("how_many")}>
            <Select value={criteria.count} onChange={(e) => set({ count: Number(e.target.value) })}>
              {[1, 2, 3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Disclosure title={t("more_filters")} className="mt-3 border-t border-line pt-2">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
            <Field label={t("min_price")}>
              <NumberInput value={criteria.min_price} onChange={(v) => set({ min_price: v })} suffix="€" allowEmpty />
            </Field>
            <Field label={t("year_to")}>
              <NumberInput value={criteria.max_year} onChange={(v) => set({ max_year: v })} allowEmpty placeholder="–" />
            </Field>
            <Field label={t("make")}>
              <Select value={criteria.make ?? ""} onChange={(e) => set({ make: e.target.value || null })}>
                <option value="">{t("any_make")}</option>
                {makes.map(([slug, name]) => (
                  <option key={slug} value={slug}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("model_query")}>
              <Input value={criteria.query} onChange={(e) => set({ query: e.target.value })} placeholder="Golf, Polo, 3er…" />
            </Field>
            <Field label={t("fuel")}>
              <Select value={criteria.fuel ?? ""} onChange={(e) => set({ fuel: e.target.value || null })}>
                <option value="">{t("any")}</option>
                {Object.entries(meta?.fuels ?? {}).map(([slug, name]) => (
                  <option key={slug} value={slug}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("gearbox")}>
              <Select value={criteria.gearbox ?? ""} onChange={(e) => set({ gearbox: (e.target.value || null) as HuntCriteria["gearbox"] })}>
                <option value="">{t("any")}</option>
                <option value="manuell">Manuell</option>
                <option value="automatik">Automatik</option>
              </Select>
            </Field>
            <Field label={t("seller_type")}>
              <Select value={criteria.seller} onChange={(e) => set({ seller: e.target.value as HuntCriteria["seller"] })}>
                <option value="privat">{t("sellers_private")}</option>
                <option value="gewerblich">{t("sellers_dealer")}</option>
                <option value="all">{t("sellers_all")}</option>
              </Select>
            </Field>
            <Field label={t("max_ads")}>
              <Select value={criteria.max_ads} onChange={(e) => set({ max_ads: Number(e.target.value) })}>
                {[5, 10, 15, 20, 30, 40].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("exclude_places")} hint={t("exclude_hint")} className="col-span-2 md:col-span-3">
              <Input value={placesText} onChange={(e) => setPlacesText(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
            <Toggle checked={skipSeen} onChange={(v) => skipStore.set(v)} label={t("skip_seen")} hint={seen.length ? `${seen.length}` : undefined} />
            <Toggle checked={prefs.ai_in_hunt} onChange={(ai_in_hunt) => prefsStore.set((p) => ({ ...p, ai_in_hunt }))} label={t("s_ai_hunt")} />
          </div>
        </Disclosure>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {running ? (
            <Button variant="danger" size="lg" className="flex-1 sm:flex-none" icon={<Square className="size-4" />} loading={hunt.stopping} onClick={stopHunt}>
              {t("stop")}
            </Button>
          ) : (
            <Button variant="primary" size="lg" className="flex-1 sm:flex-none" onClick={start}>
              {t("start_hunt")}
            </Button>
          )}
          <Button
            icon={<Bookmark className="size-4" />}
            onClick={() => {
              const name = window.prompt(t("search_name"), criteria.query || criteria.make || `≤ ${criteria.max_price ?? ""} €`);
              if (name) searchesStore.set((list) => [{ id: uid(), name, criteria: { ...criteria, exclude_places: placesText.split(",").map((p) => p.trim()).filter(Boolean) } }, ...list]);
            }}
          >
            {t("save_search")}
          </Button>
          {seen.length > 0 && (
            <Button variant="ghost" onClick={() => seenStore.set([])}>
              {t("reset_seen")}
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-faint">{t("hunt_time")}</p>
      </Card>

      {running && (
        <Card className="overflow-hidden p-5">
          <div className="flex items-center gap-4">
            {/* radar: a sweeping beam and pulsing rings while ads are checked */}
            <div className="relative size-20 shrink-0" aria-hidden="true">
              <span className="absolute inset-0 rounded-full border-2 border-accent/25" />
              <span className="absolute inset-3 rounded-full border-2 border-accent/30" />
              <span className="absolute inset-0 animate-ping rounded-full bg-accent/10" />
              <span className="radar-beam absolute inset-0 rounded-full" />
              <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">{t("hunting")}</div>
              <p className="num mt-1 text-sm text-muted">{t("hunt_progress", { checked: progress.checked ?? 0, total: progress.total ?? "…", found: progress.found ?? 0 })}</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${progress.total ? Math.max(4, ((progress.checked ?? 0) / progress.total) * 100) : 4}%` }} />
              </div>
              {job?.device && !job?.partial?.paused && <p className="mt-2 text-xs font-medium text-muted">{t("hunt_keep_open")}</p>}
              {Boolean(job?.partial?.paused) && (
                <p className="mt-2 flex items-start gap-1.5 text-xs font-medium leading-relaxed text-warn">
                  <Coffee className="mt-px size-3.5 shrink-0" /> {t("hunt_paused")}
                </p>
              )}
              {job?.partial?.current && !job?.partial?.paused && (
                <p className="mt-1.5 truncate text-xs text-faint rtl:text-right" dir="auto">
                  {String(job.partial.current)}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {error && (
        <Note tone={error.code === "blocked" ? "warn" : "bad"} icon={<AlertTriangle className="size-4" />}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorText(t, error)}</span>
            {error.code === "blocked" && (
              <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={start}>
                {t("retry")}
              </Button>
            )}
          </div>
        </Note>
      )}

      {summary && !running && (summary.stopped === "blocked" || summary.stopped === "device") && (
        <Note tone="warn" icon={<AlertTriangle className="size-4" />}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{summary.stopped === "device" ? t("hunt_stopped_device") : t("hunt_blocked", { checked: summary.checked })}</span>
            <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={start}>
              {t(summary.stopped === "device" ? "hunt_continue" : "retry")}
            </Button>
          </div>
        </Note>
      )}
      {summary && !running && summary.stopped !== "blocked" && summary.stopped !== "device" && (
        <Note tone={summary.found.length ? "good" : "neutral"} icon={summary.found.length ? <CheckCircle2 className="size-4" /> : undefined}>
          {summary.found.length ? t("hunt_done", { found: summary.found.length, checked: summary.checked }) : t("hunt_none", { n: summary.checked })}
        </Note>
      )}

      {found.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {found.map((result) => (
            <CarCard key={result.listing.id} result={result} onClick={() => { saveResult(result); navigate("analyze", result.listing.id); }} />
          ))}
        </div>
      )}
    </div>
  );
}
