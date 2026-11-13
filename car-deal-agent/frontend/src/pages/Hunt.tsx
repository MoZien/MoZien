import { AlertTriangle, BellRing, Bookmark, CheckCircle2, Coffee, Laptop, Play, Radar, RotateCcw, ScanSearch, Share, SlidersHorizontal, Smartphone, Sparkles, Square, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { DeviceHint } from "../components/DeviceHint";
import { useState } from "react";
import { CarListRow } from "../components/CarCard";
import { RadarSweep } from "../components/brand";
import { CountUp, EASE, Reveal, Stagger, StaggerItem } from "../components/motion";
import { PurposeSwitch } from "../components/PurposeSwitch";
import { Button, Card, Chip, IconTile, Disclosure, Field, Input, Modal, Note, NumberInput, PageTitle, ProgressLine, SectionTitle, Select, Toggle } from "../components/ui";
import { useApp } from "../lib/app";
import { type T, useT } from "../lib/i18n";
import { euro, km } from "../lib/format";
import { href, navigate } from "../lib/router";
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

/** "Find deals": the app's own search, or, when the server has it off (the market value is an AI
 *  estimate and the app searches no platform), how to get new ads checked through the
 *  marketplace's own search alerts and sharing. */
export function HuntPage() {
  const { meta } = useApp();
  return meta?.hunt === false ? <HuntGuide /> : <HuntSearch />;
}

function HuntGuide() {
  const t = useT();
  const steps = [
    { text: t("hunt_ai_1"), icon: <BellRing className="size-5" />, hue: "warn" as const },
    { text: t("hunt_ai_2"), icon: <Share className="size-5" />, hue: "cyan" as const },
    { text: t("hunt_ai_3"), icon: <Sparkles className="size-5" />, hue: "accent" as const },
  ];
  return (
    <div className="space-y-5 lg:space-y-6">
      <PageTitle icon={<Radar className="size-6" />} title={t("hunt_ai_title")} sub={t("hunt_ai_sub")} />
      <Stagger className="grid gap-3 sm:grid-cols-3 sm:gap-4" delay={0.06}>
        {steps.map((step, i) => (
          <StaggerItem key={i}>
            <Card className="relative h-full overflow-hidden p-4 sm:p-5">
              <span className="num pointer-events-none absolute -top-3 end-3 text-[76px] font-bold leading-none text-surface-2">{i + 1}</span>
              <IconTile hue={step.hue}>{step.icon}</IconTile>
              <p className="relative mt-3 text-[15px] leading-relaxed">{step.text}</p>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>
      <Reveal delay={0.2}>
        <Card className="flex items-start gap-3.5 p-4">
          <IconTile hue="neutral">
            <Laptop className="size-5" />
          </IconTile>
          <p className="min-w-0 flex-1 pt-1 text-sm leading-relaxed text-muted">{t("hunt_ai_web")}</p>
        </Card>
      </Reveal>
      <Reveal delay={0.25}>
        <a href={href("analyze")} className="bg-brand flex h-[52px] items-center justify-center gap-2.5 rounded-2xl text-[15px] font-semibold text-white shadow-glow transition hover:brightness-110 active:scale-[0.98]">
          <ScanSearch className="size-5" /> {t("hunt_ai_cta")}
        </a>
      </Reveal>
    </div>
  );
}

function HuntSearch() {
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
  const share = progress.total ? Math.max(0.04, (progress.checked ?? 0) / progress.total) : 0.04;

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageTitle icon={<Radar className="size-6" />} title={t("hunt_title")} sub={t("hunt_sub")} />
      <DeviceHint />

      {/* The criteria as chips; they are changed in a sheet. */}
      <Reveal delay={0.05}>
        <Card className="overflow-hidden">
          <div className="bg-brand-soft flex items-center gap-4 p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <span className="eyebrow">{t("criteria_title")}</span>
              <button type="button" onClick={() => setEditing(true)} disabled={running} className="mt-2 flex w-full cursor-pointer flex-wrap gap-1.5 text-start disabled:cursor-default">
                {parts.map((part, i) => (
                  <Chip key={i} className="bg-surface">
                    {part}
                  </Chip>
                ))}
              </button>
            </div>
            <RadarSweep className="hidden w-24 sm:block" found={found.length} />
          </div>
          <div className="p-4 sm:p-5">
            {searches.length > 0 && (
              <div className="no-scrollbar -mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                <span className="shrink-0 text-xs font-medium text-muted">{t("saved_searches")}</span>
                {searches.map((search) => (
                  <span key={search.id} className="inline-flex shrink-0 items-center rounded-full border border-accent/25 bg-accent/8 ps-3 text-[13px] text-accent">
                    <button className="flex cursor-pointer items-center gap-1.5 py-1.5 font-semibold" onClick={() => { criteriaStore.set(search.criteria); setPlacesText(search.criteria.exclude_places.join(", ")); }}>
                      <Bookmark className="size-3.5" /> {search.name}
                    </button>
                    <button aria-label={t("delete")} className="cursor-pointer px-2.5 py-1.5 text-accent/60 hover:text-bad" onClick={() => searchesStore.set((list) => list.filter((s) => s.id !== search.id))}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <PurposeSwitch compact />
              <div className="flex gap-2 sm:ms-auto">
                <Button size="lg" icon={<SlidersHorizontal className="size-[18px]" />} onClick={() => setEditing(true)} disabled={running} aria-label={t("edit")} className="px-4!">
                  <span className="hidden sm:inline">{t("edit")}</span>
                </Button>
                {running ? (
                  <Button variant="danger" size="lg" className="flex-1 sm:flex-none" icon={<Square className="size-4 fill-current" />} loading={hunt.stopping} onClick={stopHunt}>
                    {t("stop")}
                  </Button>
                ) : (
                  <Button variant="primary" size="lg" className="flex-1 sm:flex-none" icon={<Play className="size-4 fill-current" />} onClick={start}>
                    {t("start_hunt")}
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-faint">{t("hunt_time")}</p>
          </div>
        </Card>
      </Reveal>

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
          <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-x-6">
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

      <AnimatePresence>
        {running && (
          <motion.div key="running" initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.35, ease: EASE }}>
            <Card className="overflow-hidden">
              <div className="flex items-center gap-4 p-4 sm:gap-6 sm:p-5">
                <RadarSweep className="w-24 sm:w-28" found={found.length} />
                <div className="min-w-0 flex-1">
                  <div className="eyebrow">{t("hunting")}</div>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="text-[34px] font-bold leading-none tracking-tight text-accent">
                      <CountUp value={progress.found ?? found.length} />
                    </span>
                    <span className="text-sm text-muted">{t("hunt_found_label")}</span>
                  </div>
                  <p className="num mt-1.5 text-[13px] text-muted">{t("hunt_progress", { checked: progress.checked ?? 0, total: progress.total ?? "…", found: progress.found ?? 0 })}</p>
                  {job?.partial?.current && !job?.partial?.paused && (
                    <p className="mt-1 truncate text-[13px] text-faint rtl:text-right" dir="auto">
                      {String(job.partial.current)}
                    </p>
                  )}
                </div>
              </div>
              <ProgressLine value={share} live className="mx-4 mb-4 sm:mx-5" />
              {(job?.device || Boolean(job?.partial?.paused)) && (
                <div className="space-y-2 border-t border-line px-4 py-3 sm:px-5">
                  {job?.device && !job?.partial?.paused && (
                    <p className="flex items-center gap-2 text-[13px] text-muted">
                      <Smartphone className="size-4 shrink-0" /> {t("hunt_keep_open")}
                    </p>
                  )}
                  {Boolean(job?.partial?.paused) && (
                    <p className="flex items-start gap-2 text-[13px] font-medium leading-relaxed text-warn">
                      <Coffee className="mt-0.5 size-4 shrink-0" /> {t("hunt_paused")}
                    </p>
                  )}
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

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
        <section>
          <SectionTitle action={<span className="num rounded-full bg-accent/10 px-2.5 py-0.5 text-[13px] font-semibold text-accent">{found.length}</span>}>{t("hunt_results")}</SectionTitle>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <AnimatePresence initial={false}>
              {found.map((result) => (
                <motion.div key={result.listing.id} layout initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 28 }}>
                  <CarListRow result={result} onClick={() => { saveResult(result); navigate("analyze", result.listing.id); }} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
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
  const ltr = (text: string) => `⁦${text}⁩`;
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
