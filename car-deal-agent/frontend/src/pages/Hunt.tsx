import { AlertTriangle, Bookmark, CheckCircle2, Coffee, RotateCcw, SlidersHorizontal, Square, Trash2 } from "lucide-react";
import { DeviceHint } from "../components/DeviceHint";
import { useState } from "react";
import { CarListRow } from "../components/CarCard";
import { PurposeSwitch } from "../components/PurposeSwitch";
import { Button, Card, Disclosure, Field, Input, List, Modal, Note, NumberInput, PageTitle, Select, Toggle } from "../components/ui";
import { useApp } from "../lib/app";
import { type T, useT } from "../lib/i18n";
import { euro, km } from "../lib/format";
import { navigate } from "../lib/router";
import { huntStore, startHunt, stopHunt } from "../lib/hunt";
import { createScopedStore, prefsStore, saveResult, searchesStore, seenStore, uid, useStore } from "../lib/store";
import type { HuntCriteria, Meta } from "../lib/types";
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
  const [editing, setEditing] = useState(false);
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

  function saveSearch() {
    const name = window.prompt(t("search_name"), criteria.query || criteria.make || `≤ ${criteria.max_price ?? ""} €`);
    if (name) searchesStore.set((list) => [{ id: uid(), name, criteria: { ...criteria, exclude_places: placesText.split(",").map((p) => p.trim()).filter(Boolean) } }, ...list]);
  }

  const parts = criteriaSummary(criteria, t, meta);

  return (
    <div className="space-y-5">
      <PageTitle title={t("hunt_title")} sub={t("hunt_sub")} />
      <DeviceHint />

      {/* The criteria as one summary line; they are changed in a sheet. */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 cursor-pointer text-start">
            <span className="eyebrow block">{t("criteria_title")}</span>
            <span className="mt-1 block text-sm font-medium leading-relaxed sm:text-[15px]">
              {parts.map((part, i) => (
                <span key={i}>
                  <span className="whitespace-nowrap">
                    {part}
                    {i < parts.length - 1 && <span className="text-faint"> ·</span>}
                  </span>{" "}
                </span>
              ))}
            </span>
          </button>
          <Button size="sm" icon={<SlidersHorizontal className="size-4" />} onClick={() => setEditing(true)} disabled={running}>
            {t("edit")}
          </Button>
        </div>
        {searches.length > 0 && (
          <div className="no-scrollbar -mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <span className="shrink-0 text-xs text-muted">{t("saved_searches")}:</span>
            {searches.map((search) => (
              <span key={search.id} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface-2 ps-3 text-xs">
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
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center">
          <PurposeSwitch compact />
          {running ? (
            <Button variant="danger" size="lg" className="w-full sm:ms-auto sm:w-auto" icon={<Square className="size-4" />} loading={hunt.stopping} onClick={stopHunt}>
              {t("stop")}
            </Button>
          ) : (
            <Button variant="primary" size="lg" className="w-full sm:ms-auto sm:w-auto" onClick={start}>
              {t("start_hunt")}
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-faint">{t("hunt_time")}</p>
      </Card>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={t("criteria_title")}
        wide
        footer={
          <div className="flex gap-2">
            <Button icon={<Bookmark className="size-4" />} onClick={saveSearch}>
              {t("save_search")}
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setEditing(false)}>
              {t("done")}
            </Button>
          </div>
        }
      >
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
          {seen.length > 0 && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => seenStore.set([])}>
              {t("reset_seen")}
            </Button>
          )}
        </Disclosure>
      </Modal>

      {running && (
        <Card className="overflow-hidden">
          <div className="h-0.5 bg-surface-2" dir="ltr">
            <div className="h-full bg-accent transition-all duration-700" style={{ width: `${progress.total ? Math.max(4, ((progress.checked ?? 0) / progress.total) * 100) : 4}%` }} />
          </div>
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-2.5">
              <span className="relative flex size-2.5 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/50" />
                <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
              </span>
              <span className="text-[15px] font-semibold">{t("hunting")}</span>
            </div>
            <p className="num mt-1.5 text-sm text-muted">{t("hunt_progress", { checked: progress.checked ?? 0, total: progress.total ?? "…", found: progress.found ?? 0 })}</p>
            {job?.partial?.current && !job?.partial?.paused && (
              <p className="mt-1 truncate text-[13px] text-faint rtl:text-right" dir="auto">
                {String(job.partial.current)}
              </p>
            )}
            {job?.device && !job?.partial?.paused && <p className="mt-3 border-t border-line pt-3 text-[13px] text-muted">{t("hunt_keep_open")}</p>}
            {Boolean(job?.partial?.paused) && (
              <p className="mt-3 flex items-start gap-1.5 border-t border-line pt-3 text-[13px] font-medium leading-relaxed text-warn">
                <Coffee className="mt-px size-3.5 shrink-0" /> {t("hunt_paused")}
              </p>
            )}
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
        <List>
          {found.map((result) => (
            <CarListRow key={result.listing.id} result={result} onClick={() => { saveResult(result); navigate("analyze", result.listing.id); }} />
          ))}
        </List>
      )}
    </div>
  );
}

/** The criteria in a few words: "VW Golf · bis 3.000 € · ab 2002 · bis 200.000 km · 200 km um 06108 · nur privat". */
function criteriaSummary(c: HuntCriteria, t: T, meta: Meta | null): string[] {
  const parts: string[] = [];
  const make = c.make ? (meta?.makes?.[c.make] ?? c.make) : "";
  const model = [make, c.query.trim()].filter(Boolean).join(" ");
  if (model) parts.push(model);
  // Ranges read left to right in Arabic too.
  const ltr = (text: string) => `\u2066${text}\u2069`;
  if (c.max_price != null) parts.push(c.min_price ? ltr(`${euro(c.min_price)} – ${euro(c.max_price)}`) : t("sum_up_to", { v: euro(c.max_price) }));
  else if (c.min_price) parts.push(t("sum_from", { v: euro(c.min_price) }));
  if (c.min_year && c.max_year) parts.push(ltr(`${c.min_year} – ${c.max_year}`));
  else if (c.min_year) parts.push(t("sum_from", { v: c.min_year }));
  else if (c.max_year) parts.push(t("sum_up_to", { v: c.max_year }));
  if (c.max_km != null) parts.push(t("sum_up_to", { v: km(c.max_km) }));
  if (c.zip_code) parts.push(c.radius_km ? t("sum_radius", { r: c.radius_km, zip: c.zip_code }) : c.zip_code);
  if (c.fuel) parts.push(meta?.fuels?.[c.fuel] ?? c.fuel);
  if (c.gearbox) parts.push(c.gearbox === "automatik" ? "Automatik" : "Manuell");
  parts.push(t(c.seller === "privat" ? "sellers_private" : c.seller === "gewerblich" ? "sellers_dealer" : "sellers_all"));
  parts.push(t("sum_count", { n: c.count }));
  return parts;
}
