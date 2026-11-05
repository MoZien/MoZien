import { LogOut, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button, Card, Disclosure, Field, Input, Note, NumberInput, Segmented, Select, Toggle, cx, useToast } from "../components/ui";
import { ApiError, api, deleteAccount, logout } from "../lib/api";
import { useApp } from "../lib/app";
import { type TextKey, useT } from "../lib/i18n";
import {
  type Accent,
  DEFAULT_PREFS,
  DEFAULT_UI,
  type Theme,
  compareStore,
  eraseAccountData,
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
import { href, navigate } from "../lib/router";
import type { Lang, Prefs } from "../lib/types";
import { LEGAL_PAGES } from "./Legal";

const ACCENTS: { value: Accent; color: string }[] = [
  { value: "orange", color: "#ff5a1f" },
  { value: "blue", color: "#2f6bff" },
  { value: "green", color: "#12a150" },
  { value: "mono", color: "#0f172a" },
];

const LEGAL_LABEL = { impressum: "legal_imprint", datenschutz: "legal_privacy", nutzungsbedingungen: "legal_terms" } as const;

/** A group of settings that opens on tap. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Disclosure title={<span className="text-[15px] font-medium text-text">{title}</span>} className="py-2">
      <div className="space-y-4 pb-3">{children}</div>
    </Disclosure>
  );
}

export function SettingsPage() {
  const t = useT();
  const toast = useToast();
  const { meta, refresh } = useApp();
  const prefs = useStore(prefsStore);
  const ui = useStore(uiStore);
  const file = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState(false);
  const set = (patch: Partial<Prefs>) => prefsStore.set((p) => ({ ...p, ...patch }));

  /** Deletes the account on the server and its data on this device, then shows the sign-in. */
  async function removeAccount() {
    if (!window.confirm(t("delete_account_confirm"))) return;
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setDeleting(false);
        toast(t("delete_account_failed"));
        return;
      }
    }
    eraseAccountData();
    toast(t("account_deleted"));
    navigate("login");
    await refresh();
  }
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings_title")}</h1>
        <span className="text-xs text-faint">{t("settings_saved")}</span>
      </div>
      <Card className="space-y-4 p-4 sm:p-5">
        <Field label={t("language")}>
          <Segmented
            className="w-full"
            value={prefs.language}
            onChange={(language: Lang) => set({ language })}
            options={[{ value: "ar", label: "العربية" }, { value: "de", label: "Deutsch" }, { value: "en", label: "English" }]}
          />
        </Field>
        <Field label={t("theme")}>
          <Segmented className="w-full" value={ui.theme} onChange={(theme: Theme) => setUi({ theme })} options={[{ value: "system", label: t("theme_system") }, { value: "dark", label: t("theme_dark") }, { value: "light", label: t("theme_light") }]} />
        </Field>
        <Field label={t("default_purpose")}>
          <Segmented className="w-full" value={prefs.purpose} onChange={(purpose) => set({ purpose })} options={[{ value: "personal", label: t("purpose_personal") }, { value: "trade", label: t("purpose_trade") }]} />
        </Field>
        <Field label={t("home_zip")} hint={t("home_zip_hint")}>
          <ZipInput value={prefs.home_zip} onChange={(home_zip) => set({ home_zip })} />
        </Field>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold">{t("advanced")}</h2>
        <Card className="divide-y divide-line px-4 sm:px-5">
          <Group title={t("sec_trade")}>
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
          </Group>

          <Group title={t("sec_personal")}>
            <div className="grid grid-cols-2 gap-3">
              {numberField("annual_km", "s_annual_km", "km", 0)}
              <Field label={t("s_budget")}>
                <NumberInput value={prefs.max_budget} onChange={(max_budget) => set({ max_budget })} suffix="€" allowEmpty placeholder="–" />
              </Field>
              {numberField("inspection_cost", "s_inspection", "€", 0)}
              {numberField("electricity_price", "s_electricity", "€")}
            </div>
            <Field label={t("s_usage")}>
              <Segmented className="w-full" value={prefs.usage} onChange={(usage) => set({ usage })} options={[{ value: "city", label: t("usage_city") }, { value: "mixed", label: t("usage_mixed") }, { value: "highway", label: t("usage_highway") }]} />
            </Field>
          </Group>

          <Group title={t("sec_trip")}>
            <div className="grid grid-cols-2 gap-3">
              {numberField("consumption", "s_consumption", "l", 1, 30)}
              {numberField("road_factor", "s_road_factor", "×", 1, 2)}
              {numberField("petrol_price", "s_petrol", "€", 0.5, 5)}
              {numberField("diesel_price", "s_diesel", "€", 0.5, 5)}
              {numberField("lpg_price", "s_lpg", "€", 0.3, 5)}
            </div>
            <Toggle checked={prefs.round_trip} onChange={(round_trip) => set({ round_trip })} label={t("s_round_trip")} />
          </Group>

          <Group title={t("sec_valuation")}>
            <div className="grid grid-cols-2 gap-3">
              {numberField("year_window", "s_year_window", "±", 1, 4)}
              {percentField("km_window", "s_km_window", 10, 100)}
              {numberField("min_comparables", "s_min_comps", undefined, 3, 20)}
              {numberField("comparables_pages", "s_pages", undefined, 1, 3)}
              {numberField("local_radius_km", "s_local_radius", "km", 0, 500)}
            </div>
            <Field label={t("s_comps_seller")}>
              <Segmented className="w-full" value={prefs.comparables_seller} onChange={(comparables_seller) => set({ comparables_seller })} options={[{ value: "privat", label: t("sellers_private") }, { value: "gewerblich", label: t("sellers_dealer") }, { value: "all", label: t("sellers_all") }]} />
            </Field>
          </Group>

          <Group title={t("sec_ai")}>
            {meta && !meta.ai_available && <Note tone="warn">{t("ai_unavailable_note")}</Note>}
            {meta && (meta.account?.admin || !meta.auth_required) && <AiCheck />}
            <Toggle checked={prefs.ai_enabled} onChange={(ai_enabled) => set({ ai_enabled })} label={t("s_ai")} />
            <Toggle checked={prefs.ai_photos} onChange={(ai_photos) => set({ ai_photos })} label={t("s_ai_photos")} hint={t("s_ai_photos_note")} />
            <Toggle checked={prefs.ai_in_hunt} onChange={(ai_in_hunt) => set({ ai_in_hunt })} label={t("s_ai_hunt")} />
            <Field label={t("s_ai_effort")}>
              <Segmented className="w-full" value={prefs.ai_effort} onChange={(ai_effort) => set({ ai_effort })} options={[{ value: "low", label: t("effort_low") }, { value: "medium", label: t("effort_medium") }, { value: "high", label: t("effort_high") }]} />
            </Field>
          </Group>

          <Group title={t("sec_display")}>
            <Field label={t("accent")}>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((accent) => (
                  <button
                    key={accent.value}
                    aria-label={accent.value}
                    onClick={() => setUi({ accent: accent.value })}
                    className={cx("size-9 cursor-pointer rounded-full ring-offset-2 ring-offset-surface transition", ui.accent === accent.value ? "ring-2 ring-text" : "")}
                    style={{ background: accent.color }}
                  />
                ))}
              </div>
            </Field>
            <Field label={t("start_page")}>
              <Select value={ui.startPage} onChange={(e) => setUi({ startPage: e.target.value })}>
                {(["analyze", "hunt", "saved", "garage"] as const).map((page) => (
                  <option key={page} value={page}>{t(`nav_${page}` as TextKey)}</option>
                ))}
              </Select>
            </Field>
            <Toggle checked={ui.showPhotos} onChange={(showPhotos) => setUi({ showPhotos })} label={t("show_photos")} />
            <Toggle checked={ui.autoSave} onChange={(autoSave) => setUi({ autoSave })} label={t("auto_save")} />
            <Toggle checked={ui.confirmDelete} onChange={(confirmDelete) => setUi({ confirmDelete })} label={t("confirm_deletes")} />
          </Group>

          <Group title={t("sec_data")}>
            <p className="text-sm text-muted">{t("storage_note")}</p>
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
          </Group>

          {meta?.auth_required && meta.account && (
            <Group title={t("sec_account")}>
              <p className="text-sm text-muted">{t("delete_account_hint")}</p>
              <Button variant="danger" icon={<Trash2 className="size-4" />} loading={deleting} onClick={removeAccount}>
                {t("delete_account")}
              </Button>
            </Group>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-faint">
        <span>
          {meta?.account?.name && <span className="font-medium text-muted">{t("signed_in_as")} {meta.account.name} · </span>}
          {meta?.account?.usage && (
            <span>
              {t("ai_usage")}: <span className="num">{meta.account.usage.ai.used}/{meta.account.usage.ai.limit}</span> ·{" "}
            </span>
          )}
          {meta?.app_name} <span className="num">{meta?.version}</span>
        </span>
        {meta?.auth_required && (
          <Button size="sm" variant="ghost" icon={<LogOut className="size-4" />} onClick={async () => { await logout(); await refresh(); }}>{t("logout")}</Button>
        )}
      </div>
      <nav className="flex flex-wrap gap-x-4 gap-y-1 px-1 pb-2 text-sm">
        {LEGAL_PAGES.map((page) => (
          <a key={page} href={href(page)} className="text-muted underline-offset-4 hover:text-text hover:underline">
            {t(LEGAL_LABEL[page])}
          </a>
        ))}
      </nav>
    </div>
  );
}

/** For the owner: one tiny request that shows whether key, credit and model work. */
function AiCheck() {
  const t = useT();
  const prefs = useStore(prefsStore);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; model: string; reason?: string; detail?: string } | null>(null);
  async function run() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await api("/api/admin/ai-check", { body: { prefs } }));
    } catch (err) {
      setResult({ ok: false, model: "", reason: err instanceof ApiError ? err.code : "other" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button size="sm" loading={busy} onClick={run}>
        {t("ai_check")}
      </Button>
      {result && (
        <Note tone={result.ok ? "good" : "bad"}>
          {result.ok ? t("ai_check_ok", { model: result.model }) : t(`ai_reason_${result.reason ?? "other"}` as TextKey)}
          {result.detail && <span className="mt-1 block break-all text-xs opacity-80" dir="ltr">{result.detail}</span>}
        </Note>
      )}
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
