import { BadgeEuro, CarFront, Database, Fuel, LogOut, Monitor, Moon, Palette, Scale, Settings as SettingsIcon, Sparkles, Sun, Trash2, UserRound } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Reveal, Stagger, StaggerItem } from "../components/motion";
import { Button, Card, Field, Fold, type Hue, Input, Note, NumberInput, PageTitle, ProgressLine, Segmented, Select, Toggle, useToast } from "../components/ui";
import { ApiError, api, deleteAccount, logout } from "../lib/api";
import { useAiMarket, useApp } from "../lib/app";
import { type TextKey, useT } from "../lib/i18n";
import {
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


const LEGAL_LABEL = { impressum: "legal_imprint", datenschutz: "legal_privacy", nutzungsbedingungen: "legal_terms" } as const;

/** A group of settings: a card that opens on tap, with its own icon. */
function Group({ title, icon, hue, children }: { title: string; icon: ReactNode; hue: Hue; children: ReactNode }) {
  return (
    <StaggerItem>
      <Fold title={title} icon={icon} hue={hue}>
        <div className="space-y-4 pt-1">{children}</div>
      </Fold>
    </StaggerItem>
  );
}

export function SettingsPage() {
  const t = useT();
  const toast = useToast();
  const { meta, refresh } = useApp();
  const aiMarket = useAiMarket();
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

  const account = meta?.account;
  const usage = account?.usage?.ai;
  const identity = account?.email || account?.name || "";

  return (
    <div className="mx-auto max-w-2xl space-y-5 lg:space-y-6">
      <PageTitle icon={<SettingsIcon className="size-6" />} hue="neutral" title={t("settings_title")} sub={t("settings_saved")} />

      {/* Who is signed in, and how much of today's AI allowance is used. */}
      {account && (identity || usage) && (
        <Reveal delay={0.04}>
          <Card className="relative overflow-hidden p-4 sm:p-5">
            <span className="bg-brand-soft pointer-events-none absolute inset-0" />
            {identity && (
              <div className="relative flex items-center gap-3.5">
                <span className="bg-brand grid size-12 shrink-0 place-items-center rounded-2xl text-lg font-bold uppercase text-white shadow-glow">{identity.slice(0, 1)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted">{t("signed_in_as")}</div>
                  <div className="truncate text-[15px] font-semibold" dir="ltr">
                    {identity}
                  </div>
                </div>
                {meta?.auth_required && (
                  <Button size="sm" icon={<LogOut className="size-4" />} onClick={async () => { await logout(); await refresh(); }}>
                    {t("logout")}
                  </Button>
                )}
              </div>
            )}
            {usage && (
              <div className={identity ? "relative mt-4" : "relative"}>
                <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-accent" /> {t("ai_usage")}
                  </span>
                  <span className="num font-semibold text-text">
                    {usage.used}/{usage.limit}
                  </span>
                </div>
                <ProgressLine value={usage.limit ? usage.used / usage.limit : 0} className="bg-surface/70" />
              </div>
            )}
          </Card>
        </Reveal>
      )}

      <Reveal delay={0.08}>
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
            <Segmented
              className="w-full"
              value={ui.theme}
              onChange={(theme: Theme) => setUi({ theme })}
              options={[
                { value: "system", label: t("theme_system"), icon: <Monitor className="size-4" /> },
                { value: "dark", label: t("theme_dark"), icon: <Moon className="size-4" /> },
                { value: "light", label: t("theme_light"), icon: <Sun className="size-4" /> },
              ]}
            />
          </Field>
          <Field label={t("default_purpose")}>
            <Segmented className="w-full" value={prefs.purpose} onChange={(purpose) => set({ purpose })} options={[{ value: "personal", label: t("purpose_personal") }, { value: "trade", label: t("purpose_trade") }]} />
          </Field>
          <Field label={t("home_zip")} hint={t("home_zip_hint")}>
            <ZipInput value={prefs.home_zip} onChange={(home_zip) => set({ home_zip })} />
          </Field>
        </Card>
      </Reveal>

      <div>
        <h2 className="mb-3 text-[17px] font-semibold">{t("advanced")}</h2>
        <Stagger className="space-y-3" delay={0.1}>
          <Group title={t("sec_trade")} icon={<BadgeEuro className="size-4" />} hue="good">
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

          <Group title={t("sec_personal")} icon={<CarFront className="size-4" />} hue="accent">
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

          <Group title={t("sec_trip")} icon={<Fuel className="size-4" />} hue="warn">
            <div className="grid grid-cols-2 gap-3">
              {numberField("consumption", "s_consumption", "l", 1, 30)}
              {numberField("road_factor", "s_road_factor", "×", 1, 2)}
              {numberField("petrol_price", "s_petrol", "€", 0.5, 5)}
              {numberField("diesel_price", "s_diesel", "€", 0.5, 5)}
              {numberField("lpg_price", "s_lpg", "€", 0.3, 5)}
            </div>
            <Toggle checked={prefs.round_trip} onChange={(round_trip) => set({ round_trip })} label={t("s_round_trip")} />
          </Group>

          {!aiMarket && (
          <Group title={t("sec_valuation")} icon={<Scale className="size-4" />} hue="violet">
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
          )}

          <Group title={t("sec_ai")} icon={<Sparkles className="size-4" />} hue="accent">
            {meta && !meta.ai_available && <Note tone="warn">{t("ai_unavailable_note")}</Note>}
            {meta && (meta.account?.admin || !meta.auth_required) && <AiCheck />}
            <Toggle checked={prefs.ai_enabled} onChange={(ai_enabled) => set({ ai_enabled })} label={t("s_ai")} />
            <Toggle checked={prefs.ai_photos} onChange={(ai_photos) => set({ ai_photos })} label={t("s_ai_photos")} hint={t("s_ai_photos_note")} />
            {!aiMarket && <Toggle checked={prefs.ai_in_hunt} onChange={(ai_in_hunt) => set({ ai_in_hunt })} label={t("s_ai_hunt")} />}
            <Field label={t("s_ai_effort")}>
              <Segmented className="w-full" value={prefs.ai_effort} onChange={(ai_effort) => set({ ai_effort })} options={[{ value: "low", label: t("effort_low") }, { value: "medium", label: t("effort_medium") }, { value: "high", label: t("effort_high") }]} />
            </Field>
          </Group>

          <Group title={t("sec_display")} icon={<Palette className="size-4" />} hue="cyan">
            <Field label={t("start_page")}>
              <Select value={ui.startPage} onChange={(e) => setUi({ startPage: e.target.value })}>
                {(["analyze", "hunt", "saved", "garage"] as const).filter((page) => !aiMarket || page !== "hunt").map((page) => (
                  <option key={page} value={page}>{t(`nav_${page}` as TextKey)}</option>
                ))}
              </Select>
            </Field>
            <Toggle checked={ui.showPhotos} onChange={(showPhotos) => setUi({ showPhotos })} label={t("show_photos")} />
            <Toggle checked={ui.tips} onChange={(tips) => setUi({ tips })} label={t("show_tips")} />
            <Toggle checked={ui.autoSave} onChange={(autoSave) => setUi({ autoSave })} label={t("auto_save")} />
            <Toggle checked={ui.confirmDelete} onChange={(confirmDelete) => setUi({ confirmDelete })} label={t("confirm_deletes")} />
          </Group>

          <Group title={t("sec_data")} icon={<Database className="size-4" />} hue="neutral">
            <p className="text-sm leading-relaxed text-muted">{t("storage_note")}</p>
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
            <Group title={t("sec_account")} icon={<UserRound className="size-4" />} hue="bad">
              <p className="text-sm leading-relaxed text-muted">{t("delete_account_hint")}</p>
              <Button variant="danger" icon={<Trash2 className="size-4" />} loading={deleting} onClick={removeAccount}>
                {t("delete_account")}
              </Button>
            </Group>
          )}
        </Stagger>
      </div>

      <div className="flex flex-col items-center gap-3 pb-2 pt-2 text-center text-xs text-faint">
        <span>
          {meta?.app_name ?? "AutoHalle"} <span className="num">{__APP_VERSION__}</span>
        </span>
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
          {LEGAL_PAGES.map((page) => (
            <a key={page} href={href(page)} className="text-muted underline-offset-4 hover:text-text hover:underline">
              {t(LEGAL_LABEL[page])}
            </a>
          ))}
        </nav>
      </div>
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
