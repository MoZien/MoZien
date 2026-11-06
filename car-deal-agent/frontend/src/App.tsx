import {
  BadgeEuro,
  CircleHelp,
  Columns3,
  Gauge,
  Heart,
  LayoutGrid,
  Loader2,
  Radar,
  ScanSearch,
  Settings as SettingsIcon,
  Wrench,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { List, ListLink, Modal, ToastProvider, cx } from "./components/ui";
import { useApp } from "./lib/app";
import { huntStore, resumeHunt } from "./lib/hunt";
import { type TextKey, translate, useT } from "./lib/i18n";
import { href, useRoute } from "./lib/router";
import { prefsStore, savedStore, uiStore, useStore } from "./lib/store";
import { AnalyzePage } from "./pages/Analyze";
import { ComparePage } from "./pages/Compare";
import { GaragePage } from "./pages/Garage";
import { HelpPage } from "./pages/Help";
import { HuntPage } from "./pages/Hunt";
import { LoginPage } from "./pages/Login";
import { Onboarding } from "./pages/Onboarding";
import { LEGAL_PAGES, type LegalKind, LegalPage } from "./pages/Legal";
import { SavedPage } from "./pages/Saved";
import { SettingsPage } from "./pages/Settings";
import { ToolsPage } from "./pages/Tools";
import { ValuatePage } from "./pages/Valuate";

interface NavItem {
  page: string;
  label: TextKey;
  icon: (className: string) => ReactNode;
  /** one line under the label in the "More" list */
  sub?: TextKey;
}

// What people use every time, and the rest behind "More".
const MAIN: NavItem[] = [
  { page: "analyze", label: "nav_analyze", icon: (c) => <ScanSearch className={c} strokeWidth={1.75} /> },
  { page: "hunt", label: "nav_hunt", icon: (c) => <Radar className={c} strokeWidth={1.75} /> },
  { page: "saved", label: "nav_saved", icon: (c) => <Heart className={c} strokeWidth={1.75} /> },
];
const MORE: NavItem[] = [
  { page: "valuate", label: "nav_valuate", sub: "nav_valuate_sub", icon: (c) => <Gauge className={c} strokeWidth={1.75} /> },
  { page: "compare", label: "nav_compare", sub: "nav_compare_sub", icon: (c) => <Columns3 className={c} strokeWidth={1.75} /> },
  { page: "garage", label: "nav_garage", sub: "nav_garage_sub", icon: (c) => <BadgeEuro className={c} strokeWidth={1.75} /> },
  { page: "tools", label: "nav_tools", sub: "nav_tools_sub", icon: (c) => <Wrench className={c} strokeWidth={1.75} /> },
  { page: "settings", label: "nav_settings", icon: (c) => <SettingsIcon className={c} strokeWidth={1.75} /> },
  { page: "help", label: "nav_help", icon: (c) => <CircleHelp className={c} strokeWidth={1.75} /> },
];
const PAGES = new Set<string>([...MAIN, ...MORE].map((item) => item.page));
const isLegal = (page: string): page is LegalKind => (LEGAL_PAGES as string[]).includes(page);

function useApplyUi() {
  const ui = useStore(uiStore);
  const prefs = useStore(prefsStore);
  useEffect(() => {
    const root = document.documentElement;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => root.classList.toggle("dark", ui.theme === "dark" || (ui.theme === "system" && media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [ui.theme]);
  useEffect(() => {
    document.documentElement.lang = prefs.language;
    document.querySelector('meta[name="description"]')?.setAttribute("content", translate(prefs.language, "meta_description"));
    document.documentElement.dir = prefs.language === "ar" ? "rtl" : "ltr";
  }, [prefs.language]);
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
      <StatusPill />
    </ToastProvider>
  );
}

/** "Server is starting" while the free server wakes up, or "new version" after a deploy. */
function StatusPill() {
  const { waking, updateReady } = useApp();
  const t = useT();
  if (!waking && !updateReady) return null;
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] z-50 flex justify-center px-4 lg:top-4">
      <div className="animate-fade-up pointer-events-auto flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm text-on-ink shadow-lg">
        {waking ? (
          <>
            <Loader2 className="size-4 animate-spin text-muted" />
            <span>{t("server_waking")}</span>
          </>
        ) : (
          <>
            <span>{t("update_ready")}</span>
            <button className="cursor-pointer font-semibold underline-offset-4 hover:underline" onClick={() => window.location.reload()}>
              {t("reload")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Shell() {
  useApplyUi();
  const t = useT();
  const route = useRoute();
  const ui = useStore(uiStore);
  const saved = useStore(savedStore);
  const hunt = useStore(huntStore);
  const { meta, needsLogin } = useApp();
  const hunting = hunt.jobId != null;

  // A hunt that was running before the app was closed or reloaded carries on.
  useEffect(() => {
    if (meta && !needsLogin) resumeHunt();
  }, [meta, needsLogin]);
  const [moreOpen, setMoreOpen] = useState(false);
  const start = PAGES.has(ui.startPage) ? ui.startPage : "analyze";
  const page = PAGES.has(route.page) || isLegal(route.page) ? route.page : start;
  const appName = meta?.app_name ?? "AutoHalle";

  useEffect(() => {
    const item = [...MAIN, ...MORE].find((n) => n.page === page);
    const legal = { impressum: "legal_imprint", datenschutz: "legal_privacy", nutzungsbedingungen: "legal_terms" } as const;
    const label = item ? t(item.label) : isLegal(page) ? t(legal[page]) : null;
    document.title = label ? `${label} · ${appName}` : appName;
  }, [page, appName, t]);

  // Impressum, privacy policy and terms can be read before signing in.
  if (needsLogin) {
    return isLegal(page) ? (
      <main className="mx-auto max-w-2xl px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <LegalPage kind={page} back={href("login")} />
      </main>
    ) : (
      <LoginPage />
    );
  }

  const favorites = saved.filter((car) => car.favorite).length;
  const content = (() => {
    switch (page) {
      case "hunt":
        return <HuntPage />;
      case "valuate":
        return <ValuatePage />;
      case "saved":
        return <SavedPage route={route} />;
      case "compare":
        return <ComparePage />;
      case "garage":
        return <GaragePage />;
      case "tools":
        return <ToolsPage route={route} />;
      case "settings":
        return <SettingsPage />;
      case "help":
        return <HelpPage />;
      case "impressum":
      case "datenschutz":
      case "nutzungsbedingungen":
        return <LegalPage kind={page} />;
      default:
        return <AnalyzePage route={route} />;
    }
  })();

  // Tapping "Check a car" while on it goes back to the empty form.
  const home = () => page === "analyze" && window.dispatchEvent(new Event("ah:home"));

  const sideLink = (item: NavItem) => (
    <a
      key={item.page}
      href={href(item.page)}
      onClick={item.page === "analyze" ? home : undefined}
      className={cx(
        "flex items-center gap-3 rounded-[8px] px-3 py-2 text-sm transition",
        page === item.page ? "bg-surface-2 font-medium text-text" : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      {item.icon("size-4")}
      <span className="flex-1">{t(item.label)}</span>
      {item.page === "saved" && favorites > 0 && <span className="num text-xs text-faint">{favorites}</span>}
      {item.page === "hunt" && hunting && <RunningDot count={hunt.found.length} />}
    </a>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-e border-line bg-surface px-3 py-5 lg:flex">
        <a href={href("analyze")} onClick={home} className="mb-8 px-3" aria-label={appName}>
          <Logo />
        </a>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {MAIN.map(sideLink)}
          <div className="my-3 border-t border-line" />
          {MORE.slice(0, 4).map(sideLink)}
        </nav>
        <div className="space-y-0.5 border-t border-line pt-3">
          {MORE.slice(4).map(sideLink)}
          <AiStatus />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Top bar (mobile) */}
        <header className="no-print safe-top sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
          <div className="flex h-13 items-center justify-between gap-3 px-4">
            <a href={href("analyze")} onClick={home} aria-label={appName}>
              <Logo small />
            </a>
            <a href={href("settings")} aria-label={t("nav_settings")} className="-me-2 grid size-10 place-items-center rounded-full text-muted hover:text-text">
              <SettingsIcon className="size-[21px]" strokeWidth={1.75} />
            </a>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:px-10 lg:pb-12 lg:pt-8">{content}</main>
      </div>

      {/* Bottom tabs (mobile) */}
      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {MAIN.map((item) => (
            <a key={item.page} href={href(item.page)} onClick={item.page === "analyze" ? home : undefined} className={cx("flex h-14 min-w-0 flex-col items-center justify-center gap-1 text-[11px] transition", page === item.page ? "font-medium text-text" : "text-faint")}>
              <span className="relative">
                {item.icon("size-[22px]")}
                {item.page === "hunt" && hunting && (
                  <span className="absolute -end-2 -top-1">
                    <RunningDot count={hunt.found.length} />
                  </span>
                )}
              </span>
              <span className="max-w-full truncate px-1">{t(item.label)}</span>
            </a>
          ))}
          <button onClick={() => setMoreOpen(true)} className={cx("flex h-14 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 text-[11px] transition", MORE.some((n) => n.page === page) ? "font-medium text-text" : "text-faint")}>
            <LayoutGrid className="size-[22px]" strokeWidth={1.75} />
            <span className="max-w-full truncate px-1">{t("nav_more")}</span>
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title={t("nav_more")}>
        <List>
          {MORE.map((item) => (
            <ListLink key={item.page} href={href(item.page)} onClick={() => setMoreOpen(false)} active={page === item.page} icon={item.icon("size-5")} title={t(item.label)} sub={item.sub && t(item.sub)} />
          ))}
        </List>
        <div className="mt-3">
          <AiStatus />
        </div>
      </Modal>

      {!ui.onboarded && meta && <Onboarding />}
    </div>
  );
}

/** The hunt is running: a pulsing dot, with the number of cars found so far. */
function RunningDot({ count }: { count: number }) {
  return count > 0 ? (
    <span className="num grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent">{count}</span>
  ) : (
    <span className="block size-2 animate-pulse rounded-full bg-accent ring-2 ring-surface" />
  );
}

function AiStatus() {
  const { meta } = useApp();
  const t = useT();
  const prefs = useStore(prefsStore);
  if (!meta) return null;
  const on = meta.ai_available && prefs.ai_enabled;
  const usage = meta.account?.usage?.ai;
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs text-faint">
      <span className={cx("size-1.5 rounded-full", on ? "bg-good" : "bg-faint")} />
      <span className="flex-1">{on ? t("ai_on") : t(meta.ai_available ? "ai_off" : "ai_unavailable_note")}</span>
      {usage && on && !meta.account?.admin && (
        <span className="num">
          {usage.used}/{usage.limit}
        </span>
      )}
    </div>
  );
}

/** The mark: a roof over a road (a car hall, and an A). Ink, with the road in brand blue. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 44 L32 15 L50 44" stroke="currentColor" strokeWidth="7.5" />
      <path d="M14 53 H50" className="stroke-accent" strokeWidth="6.5" />
    </svg>
  );
}

/** Mark and name: "Auto" set heavier than "Halle". */
export function Logo({ small }: { small?: boolean }) {
  return (
    <span dir="ltr" className={cx("inline-flex items-center text-text", small ? "gap-2" : "gap-2.5")}>
      <LogoMark className={small ? "size-6" : "size-7"} />
      <span className={cx("leading-none tracking-[-0.02em]", small ? "text-[18px]" : "text-[20px]")}>
        <span className="font-semibold">Auto</span>
        <span className="font-normal">Halle</span>
      </span>
    </span>
  );
}
