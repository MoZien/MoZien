import {
  BadgeEuro,
  Car,
  CircleHelp,
  Columns3,
  Gauge,
  Heart,
  LayoutDashboard,
  Menu,
  Radar,
  ScanSearch,
  Settings as SettingsIcon,
  Sparkles,
  Wrench,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Modal, ToastProvider, cx } from "./components/ui";
import { PurposeSwitch } from "./components/PurposeSwitch";
import { useApp } from "./lib/app";
import { type TextKey, useT } from "./lib/i18n";
import { href, useRoute } from "./lib/router";
import { prefsStore, savedStore, uiStore, useStore } from "./lib/store";
import { AnalyzePage } from "./pages/Analyze";
import { ComparePage } from "./pages/Compare";
import { DashboardPage } from "./pages/Dashboard";
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
  icon: ReactNode;
}

const NAV: NavItem[] = [
  { page: "dashboard", label: "nav_dashboard", icon: <LayoutDashboard className="size-[18px]" /> },
  { page: "analyze", label: "nav_analyze", icon: <ScanSearch className="size-[18px]" /> },
  { page: "hunt", label: "nav_hunt", icon: <Radar className="size-[18px]" /> },
  { page: "valuate", label: "nav_valuate", icon: <Gauge className="size-[18px]" /> },
  { page: "saved", label: "nav_saved", icon: <Heart className="size-[18px]" /> },
  { page: "compare", label: "nav_compare", icon: <Columns3 className="size-[18px]" /> },
  { page: "garage", label: "nav_garage", icon: <BadgeEuro className="size-[18px]" /> },
  { page: "tools", label: "nav_tools", icon: <Wrench className="size-[18px]" /> },
  { page: "settings", label: "nav_settings", icon: <SettingsIcon className="size-[18px]" /> },
  { page: "help", label: "nav_help", icon: <CircleHelp className="size-[18px]" /> },
];
const MOBILE_TABS = ["dashboard", "analyze", "hunt", "saved"];

function useApplyUi() {
  const ui = useStore(uiStore);
  const prefs = useStore(prefsStore);
  useEffect(() => {
    const root = document.documentElement;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => root.classList.toggle("dark", ui.theme === "dark" || (ui.theme === "system" && media.matches));
    apply();
    media.addEventListener("change", apply);
    if (ui.accent === "indigo") delete root.dataset.accent;
    else root.dataset.accent = ui.accent;
    return () => media.removeEventListener("change", apply);
  }, [ui.theme, ui.accent]);
  useEffect(() => {
    document.documentElement.lang = prefs.language;
    document.documentElement.dir = prefs.language === "ar" ? "rtl" : "ltr";
  }, [prefs.language]);
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  useApplyUi();
  const t = useT();
  const route = useRoute();
  const ui = useStore(uiStore);
  const saved = useStore(savedStore);
  const { meta, needsLogin } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);
  const page = route.page || ui.startPage || "dashboard";
  const appName = meta?.app_name ?? "AutoHalle";

  useEffect(() => {
    document.title = `${t(NAV.find((n) => n.page === page)?.label ?? "nav_dashboard")} · ${appName}`;
  }, [page, appName, t]);

  if (needsLogin) return <LoginPage />;

  const favorites = saved.filter((car) => car.favorite).length;
  const content = (() => {
    switch (page) {
      case "analyze":
        return <AnalyzePage route={route} />;
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
        return <DashboardPage />;
    }
  })();

  return (
    <div className="min-h-dvh lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line bg-surface/70 px-3 py-5 backdrop-blur-xl lg:flex">
        <a href={href("dashboard")} className="mb-6 flex items-center gap-2.5 px-3">
          <Logo />
          <div>
            <div className="text-[17px] font-extrabold tracking-tight">{appName}</div>
            <div className="text-[11px] text-faint">{t("tagline")}</div>
          </div>
        </a>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <a
              key={item.page}
              href={href(item.page)}
              className={cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                page === item.page ? "bg-accent/12 text-accent" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              {item.icon}
              <span className="flex-1">{t(item.label)}</span>
              {item.page === "saved" && favorites > 0 && <span className="num rounded-full bg-accent/15 px-2 text-xs text-accent">{favorites}</span>}
            </a>
          ))}
        </nav>
        <div className="mt-4 space-y-3 border-t border-line px-1 pt-4">
          <PurposeSwitch compact />
          <AiStatus />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Top bar (mobile) */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur-xl lg:hidden">
          <a href={href("dashboard")} className="flex items-center gap-2">
            <Logo small />
            <span className="text-base font-extrabold tracking-tight">{appName}</span>
          </a>
          <PurposeSwitch compact tiny />
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">{content}</main>
      </div>

      {/* Bottom tabs (mobile) */}
      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {MOBILE_TABS.map((name) => {
            const item = NAV.find((n) => n.page === name)!;
            return (
              <a key={name} href={href(name)} className={cx("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", page === name ? "text-accent" : "text-muted")}>
                {item.icon}
                <span className="max-w-full truncate px-1">{t(item.label)}</span>
              </a>
            );
          })}
          <button onClick={() => setMoreOpen(true)} className={cx("flex cursor-pointer flex-col items-center gap-1 py-2.5 text-[11px] font-medium", !MOBILE_TABS.includes(page) ? "text-accent" : "text-muted")}>
            <Menu className="size-[18px]" />
            {t("nav_more")}
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title={t("nav_more")}>
        <div className="grid grid-cols-3 gap-2">
          {NAV.filter((n) => !MOBILE_TABS.includes(n.page)).map((item) => (
            <a
              key={item.page}
              href={href(item.page)}
              onClick={() => setMoreOpen(false)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface-2/60 p-4 text-center text-xs font-medium"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-accent/12 text-accent">{item.icon}</span>
              {t(item.label)}
            </a>
          ))}
        </div>
        <div className="mt-4">
          <AiStatus />
        </div>
      </Modal>

      {!ui.onboarded && meta && <Onboarding />}
    </div>
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
    <div className="flex items-center gap-2 rounded-xl bg-surface-2/70 px-3 py-2 text-xs text-muted">
      <Sparkles className={cx("size-4", on ? "text-accent" : "text-faint")} />
      <span className="flex-1">{on ? `AI · ${meta.ai_model.replace("claude-", "")}` : t(meta.ai_available ? "ai_off" : "ai_unavailable_note")}</span>
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
    <span className={cx("grid place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/30", small ? "size-8" : "size-10")}>
      <Car className={small ? "size-4.5" : "size-5"} strokeWidth={2.2} />
    </span>
  );
}
