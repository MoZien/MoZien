import {
  BadgeEuro,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Columns3,
  Gauge,
  Heart,
  Loader2,
  Menu,
  Radar,
  ScanSearch,
  Settings as SettingsIcon,
  Wrench,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Modal, ToastProvider, cx } from "./components/ui";
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
import { SavedPage } from "./pages/Saved";
import { SettingsPage } from "./pages/Settings";
import { ToolsPage } from "./pages/Tools";
import { ValuatePage } from "./pages/Valuate";

interface NavItem {
  page: string;
  label: TextKey;
  icon: (className: string) => ReactNode;
}

// What people use every time, and the rest behind "More".
const MAIN: NavItem[] = [
  { page: "analyze", label: "nav_analyze", icon: (c) => <ScanSearch className={c} /> },
  { page: "hunt", label: "nav_hunt", icon: (c) => <Radar className={c} /> },
  { page: "saved", label: "nav_saved", icon: (c) => <Heart className={c} /> },
];
const MORE: NavItem[] = [
  { page: "valuate", label: "nav_valuate", icon: (c) => <Gauge className={c} /> },
  { page: "compare", label: "nav_compare", icon: (c) => <Columns3 className={c} /> },
  { page: "garage", label: "nav_garage", icon: (c) => <BadgeEuro className={c} /> },
  { page: "tools", label: "nav_tools", icon: (c) => <Wrench className={c} /> },
  { page: "settings", label: "nav_settings", icon: (c) => <SettingsIcon className={c} /> },
  { page: "help", label: "nav_help", icon: (c) => <CircleHelp className={c} /> },
];
const PAGES = new Set([...MAIN, ...MORE].map((item) => item.page));

function useApplyUi() {
  const ui = useStore(uiStore);
  const prefs = useStore(prefsStore);
  useEffect(() => {
    const root = document.documentElement;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => root.classList.toggle("dark", ui.theme === "dark" || (ui.theme === "system" && media.matches));
    apply();
    media.addEventListener("change", apply);
    if (ui.accent === "blue" || ui.accent === "green" || ui.accent === "orange") root.dataset.accent = ui.accent;
    else delete root.dataset.accent;
    return () => media.removeEventListener("change", apply);
  }, [ui.theme, ui.accent]);
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
      <div className="animate-fade-up pointer-events-auto flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm shadow-lg">
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
  const page = PAGES.has(route.page) ? route.page : start;
  const appName = meta?.app_name ?? "AutoHalle";
  const Chevron = t.lang === "ar" ? ChevronLeft : ChevronRight;

  useEffect(() => {
    const item = [...MAIN, ...MORE].find((n) => n.page === page);
    document.title = item ? `${t(item.label)} · ${appName}` : appName;
  }, [page, appName, t]);

  if (needsLogin) return <LoginPage />;

  const favorites = saved.filter((car) => car.favorite).length;
  const content = (() => {
    switch (page) {
      case "hunt":
        return <HuntPage />;
      case "valuate":
        return <ValuatePage />;
      case "saved":
        return <SavedPage />;
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
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
        page === item.page ? "bg-surface-2 font-semibold text-text" : "text-muted hover:bg-surface-2 hover:text-text",
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
        <a href={href("analyze")} onClick={home} className="mb-7 flex items-center gap-2.5 px-3">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">{appName}</span>
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
        <header className="no-print safe-top sticky top-0 z-30 border-b border-line bg-bg lg:hidden">
          <div className="flex h-13 items-center justify-between gap-3 px-4">
            <a href={href("analyze")} onClick={home} className="flex items-center gap-2">
              <Logo small />
              <span className="text-[15px] font-semibold tracking-tight">{appName}</span>
            </a>
            <a href={href("settings")} aria-label={t("nav_settings")} className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text">
              <SettingsIcon className="size-5" />
            </a>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{content}</main>
      </div>

      {/* Bottom tabs (mobile) */}
      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {MAIN.map((item) => (
            <a key={item.page} href={href(item.page)} onClick={item.page === "analyze" ? home : undefined} className={cx("flex min-w-0 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px]", page === item.page ? "font-semibold text-text" : "text-muted")}>
              <span className="relative">
                {item.icon("size-5")}
                {item.page === "hunt" && hunting && (
                  <span className="absolute -end-1.5 -top-1">
                    <RunningDot count={hunt.found.length} />
                  </span>
                )}
              </span>
              <span className="max-w-full truncate px-1">{t(item.label)}</span>
            </a>
          ))}
          <button onClick={() => setMoreOpen(true)} className={cx("flex min-w-0 cursor-pointer flex-col items-center gap-1 pb-2 pt-2.5 text-[11px]", MORE.some((n) => n.page === page) ? "font-semibold text-text" : "text-muted")}>
            <Menu className="size-5" />
            <span className="max-w-full truncate px-1">{t("nav_more")}</span>
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title={t("nav_more")}>
        <div className="-mx-2 divide-y divide-line">
          {MORE.map((item) => (
            <a key={item.page} href={href(item.page)} onClick={() => setMoreOpen(false)} className="flex items-center gap-3 px-2 py-3.5 text-[15px] hover:bg-surface-2">
              <span className="text-muted">{item.icon("size-5")}</span>
              <span className="flex-1">{t(item.label)}</span>
              <Chevron className="size-4 text-faint" />
            </a>
          ))}
        </div>
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
    <span className="num grid h-4 min-w-4 place-items-center rounded-full bg-good px-1 text-[10px] font-semibold text-white">{count}</span>
  ) : (
    <span className="block size-2.5 animate-pulse rounded-full bg-good ring-2 ring-surface" />
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

export function Logo({ small }: { small?: boolean }) {
  return (
    <span className={cx("grid place-items-center rounded-lg bg-text text-bg", small ? "size-7" : "size-8")}>
      <svg viewBox="0 0 512 512" className={small ? "size-5" : "size-6"} fill="none" stroke="currentColor" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M126 292 L156 212 Q165 190 190 190 H322 Q347 190 356 212 L386 292" />
        <path d="M112 292 H400 Q414 292 414 306 V344 Q414 358 400 358 H112 Q98 358 98 344 V306 Q98 292 112 292 Z" />
        <path d="M150 358 V386 M362 358 V386" />
      </svg>
    </span>
  );
}
