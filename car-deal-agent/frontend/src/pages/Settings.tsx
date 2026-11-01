import { BadgeEuro, Bot, Car, Database, Fuel, Gauge, Home, LogOut, Monitor, Palette, Sliders, User } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button, Card, CardHeader, Field, Input, Note, NumberInput, Segmented, Select, Toggle, cx, useToast } from "../components/ui";
import { logout } from "../lib/api";
import { useApp } from "../lib/app";
import { type TextKey, useT } from "../lib/i18n";
import {
  type Accent,
  DEFAULT_PREFS,
  DEFAULT_UI,
  type Theme,
  compareStore,
  exportData,
  garageStore,
  importData,
  prefsStore,
  savedStore,
  searchesStore,
  seenStore,
  uiStore,
  useStore,
} from "../lib/store";
import type { Lang, Prefs } from "../lib/types";

const ACCENTS: { value: Accent; color: string }[] = [
  { value: "indigo", color: "#5b5bf6" },
  { value: "emerald", color: "#10b981" },
  { value: "sky", color: "#0ea5e9" },
  { value: "violet", color: "#8b5cf6" },
  { value: "rose", color: "#f43f5e" },
  { value: "amber", color: "#f59e0b" },
];

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-5">
      <CardHeader title={title} icon={icon} />
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

export function SettingsPage() {
  const t = useT();
  const toast = useToast();
  const { meta, refresh } = useApp();
  const prefs = useStore(prefsStore);
  const ui = useStore(uiStore);
  const file = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Prefs>) => prefsStore.set((p) => ({ ...p, ...patch }));
  const setUi = (patch: Partial<typeof ui>) => uiStore.set((u) => ({ ...u, ...patch }));

  // Percent values are stored as fractions (0.15) and shown as percent (15).
  const percentField = (key: keyof Prefs, label: TextKey, min = 0, max = 100) => (
    <Field label={t(label)}>
      <NumberInput value={Math.round((prefs[key] as number) * 1000) / 10} onChange={(v) => v != null && set({ [key]: v / 100 } as Partial<Prefs>)} suffix="%" min={min} max={max} />
    </Field>
  );
  const numberField = (key: keyof Prefs, label: TextKey, suffix?: string, min?: number, max?: number, hint?: TextKey) => (
    <Field label={t(label)} hint={hint ? t(hint) : undefined}>
      <NumberInput value={prefs[key] as number | null} onChange={(v) => v != null && set({ [key]: v } as Partial<Prefs>)} suffix={suffix} min={min} max={max} />
    </Field>
  );

  function download() {
    const blob = new Blob([exportData()], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `autohalle-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function upload(f: File) {
    try {
      toast(importData(await f.text()) ? t("import_done") : t("import_failed"), "good");
    } catch {
      toast(t("import_failed"), "bad");
    }
  }

  const confirm = (fn: () => void) => () => window.confirm(t("confirm_delete")) && fn();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-xl font-bold sm:text-2xl">{t("settings_title")}</h1>
        <span className="text-xs text-faint">{t("settings_saved")}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t("sec_general")} icon={<Sliders className="size-4" />}>
          <Field label={t("language")}>
            <Segmented
              value={prefs.language}
              onChange={(language: Lang) => set({ language })}
              options={[{ value: "ar", label: "العربية" }, { value: "de", label: "Deutsch" }, { value: "en", label: "English" }]}
            />
          </Field>
          <Field label={t("default_purpose")}>
            <Segmented value={prefs.purpose} onChange={(purpose) => set({ purpose })} options={[{ value: "personal", label: t("purpose_personal_short") }, { value: "trade", label: t("purpose_trade_short") }]} />
          </Field>
          <Field label={t("home_zip")} hint={t("home_zip_hint")}>
            <ZipInput value={prefs.home_zip} onChange={(home_zip) => set({ home_zip })} />
          </Field>
          <Field label={t("start_page")}>
            <Select value={ui.startPage} onChange={(e) => setUi({ startPage: e.target.value })}>
              {(["dashboard", "analyze", "hunt", "saved", "garage"] as const).map((page) => (
                <option key={page} value={page}>{t(`nav_${page}` as TextKey)}</option>
              ))}
            </Select>
          </Field>
        </Section>

        <Section title={t("sec_display")} icon={<Monitor className="size-4" />}>
          <Field label={t("theme")}>
            <Segmented value={ui.theme} onChange={(theme: Theme) => setUi({ theme })} options={[{ value: "system", label: t("theme_system") }, { value: "dark", label: t("theme_dark") }, { value: "light", label: t("theme_light") }]} />
          </Field>
          <Field label={t("accent")}>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((accent) => (
                <button key={accent.value} aria-label={accent.value} onClick={() => setUi({ accent: accent.value })} className={cx("size-9 cursor-pointer rounded-full border-4 transition", ui.accent === accent.value ? "border-text" : "border-transparent")} style={{ background: accent.color }} />
              ))}
            </div>
          </Field>
          <Toggle checked={ui.showPhotos} onChange={(showPhotos) => setUi({ showPhotos })} label={t("show_photos")} />
          <Toggle checked={ui.tips} onChange={(tips) => setUi({ tips })} label={t("show_tips")} />
          <Toggle checked={ui.autoSave} onChange={(autoSave) => setUi({ autoSave })} label={t("auto_save")} />
          <Toggle checked={ui.confirmDelete} onChange={(confirmDelete) => setUi({ confirmDelete })} label={t("confirm_deletes")} />
        </Section>

        <Section title={t("sec_trade")} icon={<BadgeEuro className="size-4" />}>
          <div className="grid grid-cols-2 gap-3">
            {numberField("min_profit", "s_min_profit", "€", 0)}
            {percentField("min_roi", "s_min_roi")}
            {percentField("negotiation_discount", "s_negotiation", 0, 50)}
            {percentField("resale_factor", "s_resale", 50, 120)}
            {percentField("min_discount", "s_min_discount", 0, 90)}
            {percentField("suspicious_discount", "s_suspicious", 10, 95)}
            {numberField("hu_cost", "s_hu_cost", "€", 0)}
            {numberField("hu_warning_months", "s_hu_months", undefined, 0, 24)}
            {numberField("fixed_costs", "s_fixed", "€", 0, 20000, "s_fixed_hint")}
          </div>
          <Toggle checked={prefs.vat_margin_scheme} onChange={(vat_margin_scheme) => set({ vat_margin_scheme })} label={t("s_vat")} />
        </Section>

        <Section title={t("sec_personal")} icon={<Home className="size-4" />}>
          <div className="grid grid-cols-2 gap-3">
            {numberField("annual_km", "s_annual_km", "km", 0)}
            <Field label={t("s_budget")}>
              <NumberInput value={prefs.max_budget} onChange={(max_budget) => set({ max_budget })} suffix="€" allowEmpty placeholder="–" />
            </Field>
            {numberField("inspection_cost", "s_inspection", "€", 0)}
            {numberField("electricity_price", "s_electricity", "€")}
          </div>
          <Field label={t("s_usage")}>
            <Segmented value={prefs.usage} onChange={(usage) => set({ usage })} options={[{ value: "city", label: t("usage_city") }, { value: "mixed", label: t("usage_mixed") }, { value: "highway", label: t("usage_highway") }]} />
          </Field>
        </Section>

        <Section title={t("sec_trip")} icon={<Fuel className="size-4" />}>
          <div className="grid grid-cols-2 gap-3">
            {numberField("consumption", "s_consumption", "l", 1, 30)}
            {numberField("road_factor", "s_road_factor", "×", 1, 2)}
            {numberField("petrol_price", "s_petrol", "€", 0.5, 5)}
            {numberField("diesel_price", "s_diesel", "€", 0.5, 5)}
            {numberField("lpg_price", "s_lpg", "€", 0.3, 5)}
          </div>
          <Toggle checked={prefs.round_trip} onChange={(round_trip) => set({ round_trip })} label={t("s_round_trip")} />
        </Section>

        <Section title={t("sec_valuation")} icon={<Gauge className="size-4" />}>
          <div className="grid grid-cols-2 gap-3">
            {numberField("year_window", "s_year_window", "±", 1, 4)}
            {percentField("km_window", "s_km_window", 10, 100)}
            {numberField("min_comparables", "s_min_comps", undefined, 3, 20)}
            {numberField("comparables_pages", "s_pages", undefined, 1, 3)}
            {numberField("local_radius_km", "s_local_radius", "km", 0, 500)}
          </div>
          <Field label={t("s_comps_seller")}>
            <Segmented value={prefs.comparables_seller} onChange={(comparables_seller) => set({ comparables_seller })} options={[{ value: "privat", label: t("sellers_private") }, { value: "gewerblich", label: t("sellers_dealer") }, { value: "all", label: t("sellers_all") }]} />
          </Field>
        </Section>

        <Section title={t("sec_ai")} icon={<Bot className="size-4" />}>
          {meta && !meta.ai_available && <Note tone="warn">{t("ai_unavailable_note")}</Note>}
          <Toggle checked={prefs.ai_enabled} onChange={(ai_enabled) => set({ ai_enabled })} label={t("s_ai")} hint={meta?.ai_model} />
          <Toggle checked={prefs.ai_in_hunt} onChange={(ai_in_hunt) => set({ ai_in_hunt })} label={t("s_ai_hunt")} />
          <Field label={t("s_ai_effort")}>
            <Segmented value={prefs.ai_effort} onChange={(ai_effort) => set({ ai_effort })} options={[{ value: "low", label: t("effort_low") }, { value: "medium", label: t("effort_medium") }, { value: "high", label: t("effort_high") }]} />
          </Field>
        </Section>

        <Section title={t("sec_data")} icon={<Database className="size-4" />}>
          <Note>{t("storage_note")}</Note>
          <div className="flex flex-wrap gap-2">
            <Button onClick={download}>{t("export")}</Button>
            <Button onClick={() => file.current?.click()}>{t("import")}</Button>
            <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={confirm(() => savedStore.set((cars) => cars.filter((c) => c.favorite)))}>{t("clear_history")}</Button>
            <Button variant="ghost" onClick={confirm(() => { prefsStore.set(DEFAULT_PREFS); uiStore.set({ ...DEFAULT_UI, onboarded: true }); })}>{t("reset_settings")}</Button>
            <Button variant="danger" onClick={confirm(() => { [savedStore, garageStore, searchesStore, seenStore, compareStore].forEach((s) => s.set([] as never)); })}>{t("clear_all")}</Button>
          </div>
        </Section>

        <Section title={t("sec_account")} icon={<User className="size-4" />}>
          {meta?.account?.name && <p className="text-sm font-medium">{meta.account.name}</p>}
          {meta?.account?.usage && (
            <div className="text-sm">
              <span className="text-muted">{t("ai_usage")}: </span>
              <span className="num">{meta.account.usage.ai.used}/{meta.account.usage.ai.limit}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-faint">
            <Car className="size-3.5" /> {meta?.app_name} · {t("version")} <span className="num">{meta?.version}</span>
          </div>
          {meta?.auth_required && (
            <Button variant="ghost" icon={<LogOut className="size-4" />} onClick={async () => { await logout(); await refresh(); }}>{t("logout")}</Button>
          )}
          <div className="flex items-center gap-2 text-xs text-faint">
            <Palette className="size-3.5" /> React · FastAPI · Claude
          </div>
        </Section>
      </div>
    </div>
  );
}

/** A postal code field that only stores complete five-digit codes. */
export function ZipInput({ value, onChange }: { value: string; onChange: (zip: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <Input
      value={text}
      inputMode="numeric"
      className="num"
      onChange={(event) => {
        const zip = event.target.value.replace(/\D/g, "").slice(0, 5);
        setText(zip);
        if (zip.length === 5) onChange(zip);
      }}
      onBlur={() => text.length !== 5 && setText(value)}
    />
  );
}
