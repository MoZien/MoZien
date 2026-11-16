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
  Sparkles,
  Wrench,
} from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { Logo } from "./components/brand";
import { EASE, SPRING, useScrolled } from "./components/motion";
import { type Hue, IconTile, Modal, ProgressLine, ToastProvider, cx } from "./components/ui";
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

export { Logo, LogoMark } from "./components/brand";

interface NavItem {
  page: string;
  label: TextKey;
  icon: (className: string, active?: boolean) => ReactNode;
  /** one line under the label in the "More" sheet */
  sub?: TextKey;
  hue?: Hue;
}

const stroke = (active?: boolean) => (active ? 2.1 : 1.75);

// What people use every time, and the rest behind "More".
const MAIN: NavItem[] = [
  { page: "analyze", label: "nav_analyze", icon: (c, a) => <ScanSearch className={c} strokeWidth={stroke(a)} /> },
  { page: "hunt", label: "nav_hunt", icon: (c, a) => <Radar className={c} strokeWidth={stroke(a)} /> },
  { page: "saved", label: "nav_saved", icon: (c, a) => <Heart className={cx(c, a && "fill-accent/20")} strokeWidth={stroke(a)} /> },
];
const MORE: NavItem[] = [
  { page: "valuate", label: "nav_valuate", sub: "nav_valuate_sub", hue: "violet", icon: (c, a) => <Gauge className={c} strokeWidth={stroke(a)} /> },
  { page: "compare", label: "nav_compare", sub: "nav_compare_sub", hue: "cyan", icon: (c, a) => <Columns3 className={c} strokeWidth={stroke(a)} /> },
  { page: "garage", label: "nav_garage", sub: "nav_garage_sub", hue: "good", icon: (c, a) => <BadgeEuro className={c} strokeWidth={stroke(a)} /> },
  { page: "tools", label: "nav_tools", sub: "nav_tools_sub", hue: "warn", icon: (c, a) => <Wrench className={c} strokeWidth={stroke(a)} /> },
  { page: "settings", label: "nav_settings", sub: "nav_settings_sub", hue: "neutral", icon: (c, a) => <SettingsIcon className={c} strokeWidth={stroke(a)} /> },
  { page: "help", label: "nav_help", sub: "nav_help_sub", hue: "accent", icon: (c, a) => <CircleHelp className={c} strokeWidth={stroke(a)} /> },
];
const PAGES = new Set<string>([...MAIN, ...MORE].map((item) => item.page));
const isLegal = (page: string): page is LegalKind => (LEGAL_PAGES as string[]).includes(page);

function useApplyUi() {
  const ui = useStore(uiStore);
  const prefs = useStore(prefsStore);
  useEffect(() => {
    const root = document.documentElement;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = ui.theme === "dark" || (ui.theme === "system" && media.matches);
      root.classList.toggle("dark", dark);
      // The browser bar and the phone's status bar take the page colour.
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", dark ? "#060a13" : "#f3f5fa"));
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [ui.theme]);
  useEffect(() => {
    document.documentElement.lang = prefs.language;
    const ai = JSON.parse(localStorage.getItem("ah.meta") || "null")?.market_source === "ai";
    document.querySelector('meta[name="description"]')?.setAttribute("content", translate(prefs.language, ai ? "meta_description_ai" : "meta_description"));
    document.documentElement.dir = prefs.language === "ar" ? "rtl" : "ltr";
  }, [prefs.language]);
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <Shell />
        <StatusPill />
      </ToastProvider>
    </MotionConfig>
  );
}

/** "Server is starting" while the free server wakes up, or "new version" after a deploy. */
function StatusPill() {
  const { waking, updateReady } = useApp();
  const t = useT();
  return (
    <AnimatePresence>
      {(waking || updateReady) && (
        <motion.div
          className="no-print pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.25rem)] z-50 flex justify-center px-4 lg:top-5"
          initial={{ opacity: 0, y: -14, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        >
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-[#0b1324] px-4 py-2.5 text-sm text-white shadow-pop ring-1 ring-white/10">
            {waking ? (
              <>
                <Loader2 className="size-4 animate-spin text-white/60" />
                <span>{t("server_waking")}</span>
              </>
            ) : (
              <>
                <Sparkles className="size-4 text-[#7fe3ff]" />
                <span>{t("update_ready")}</span>
                <button className="cursor-pointer rounded-full bg-white/15 px-2.5 py-0.5 font-semibold hover:bg-white/25" onClick={() => window.location.reload()}>
                  {t("reload")}
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
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
  const scrolled = useScrolled();

  // Without the deal hunt (the public app: market value as an AI estimate, no marketplace
  // searches) its tab goes, and "Compare" takes its place in the bar.
  const huntOn = meta?.hunt !== false;
  const main = huntOn ? MAIN : [MAIN[0], MAIN[2], MORE[1]];
  const more = huntOn ? MORE : MORE.filter((item) => item.page !== "compare");
  const available = (name: string) => PAGES.has(name) && (huntOn || name !== "hunt");

  // A hunt that was running before the app was closed or reloaded carries on.
  useEffect(() => {
    if (meta && !needsLogin && meta.hunt !== false) resumeHunt();
  }, [meta, needsLogin]);
  const [moreOpen, setMoreOpen] = useState(false);
  const start = available(ui.startPage) ? ui.startPage : "analyze";
  const page = available(route.page) || isLegal(route.page) ? route.page : start;
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

  const sideLink = (item: NavItem) => {
    const active = page === item.page;
    return (
      <a
        key={item.page}
        href={href(item.page)}
        onClick={item.page === "analyze" ? home : undefined}
        className={cx("relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200", active ? "font-semibold text-accent" : "text-muted hover:bg-surface-2 hover:text-text")}
      >
        {active && <motion.span layoutId="side-active" transition={SPRING} className="absolute inset-0 rounded-xl bg-accent/10 ring-1 ring-accent/15" />}
        <span className="relative">{item.icon("size-[18px]", active)}</span>
        <span className="relative flex-1">{t(item.label)}</span>
        {item.page === "saved" && favorites > 0 && <span className="num relative rounded-full bg-surface-2 px-1.5 text-xs font-medium text-muted">{favorites}</span>}
        {item.page === "hunt" && hunting && (
          <span className="relative">
            <RunningDot count={hunt.found.length} />
          </span>
        )}
      </a>
    );
  };

  const moreActive = more.some((n) => n.page === page);

  return (
    <div className="min-h-dvh lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line bg-surface/70 px-3.5 py-5 backdrop-blur-xl lg:flex">
        <a href={href("analyze")} onClick={home} className="mb-7 px-2.5" aria-label={appName}>
          <Logo />
        </a>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {main.map(sideLink)}
          <div className="eyebrow mb-1 mt-5 px-3">{t("nav_more")}</div>
          {more.slice(0, more.length - 2).map(sideLink)}
        </nav>
        <div className="space-y-1 border-t border-line pt-3">
          {more.slice(more.length - 2).map(sideLink)}
          <AiStatus />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Top bar (mobile): clear at the top of the page, frosted once the page moves under it. */}
        <header className={cx("no-print safe-top sticky top-0 z-30 border-b transition-colors duration-300 lg:hidden", scrolled ? "glass border-line" : "border-transparent")}>
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <a href={href("analyze")} onClick={home} aria-label={appName}>
              <Logo small />
            </a>
            <div className="-me-1.5 flex items-center gap-1">
              {hunting && (
                <a href={href("hunt")} className="flex h-9 items-center gap-2 rounded-full bg-accent/10 px-3 text-xs font-semibold text-accent">
                  <RunningDot count={hunt.found.length} />
                  {t("nav_hunt")}
                </a>
              )}
              <a href={href("settings")} aria-label={t("nav_settings")} className="grid size-10 place-items-center rounded-full text-muted transition hover:text-text active:scale-90">
                <SettingsIcon className="size-[21px]" strokeWidth={1.75} />
              </a>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-36 pt-2 sm:px-6 sm:pt-6 lg:px-10 lg:pb-14 lg:pt-9">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={page} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22, ease: EASE }}>
              {content}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Tab bar (mobile): floats above the page. */}
      <nav className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] lg:hidden">
        <div className="glass pointer-events-auto mx-auto grid max-w-md grid-cols-4 gap-1 rounded-[26px] border border-line p-1.5 shadow-pop">
          {main.map((item) => (
            <TabLink key={item.page} href={href(item.page)} active={page === item.page} label={t(item.label)} onClick={item.page === "analyze" ? home : undefined}>
              {item.icon("size-[22px]", page === item.page)}
              {item.page === "hunt" && hunting && (
                <span className="absolute -end-2.5 -top-1">
                  <RunningDot count={hunt.found.length} />
                </span>
              )}
            </TabLink>
          ))}
          <TabLink active={moreActive} label={t("nav_more")} onClick={() => setMoreOpen(true)}>
            <LayoutGrid className="size-[22px]" strokeWidth={stroke(moreActive)} />
          </TabLink>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title={t("nav_more")}>
        <div className="grid grid-cols-2 gap-2.5">
          {more.map((item) => (
            <a
              key={item.page}
              href={href(item.page)}
              onClick={() => setMoreOpen(false)}
              className={cx("flex flex-col gap-3 rounded-2xl border p-3.5 transition duration-200 active:scale-[0.97]", page === item.page ? "border-accent/40 bg-accent/8" : "border-line bg-surface-2/60 hover:bg-surface-2")}
            >
              <IconTile hue={item.hue}>{item.icon("size-5")}</IconTile>
              <span>
                <span className="block text-[15px] font-semibold leading-tight">{t(item.label)}</span>
                {item.sub && <span className="mt-1 block text-xs leading-snug text-muted">{t(item.sub)}</span>}
              </span>
            </a>
          ))}
        </div>
        <div className="mt-3 rounded-2xl border border-line">
          <AiStatus />
        </div>
      </Modal>

      {!ui.onboarded && meta && <Onboarding />}
    </div>
  );
}

/** One place in the tab bar: the icon, its name, and a soft fill that slides to the active one. */
function TabLink({ href: target, active, label, onClick, children }: { href?: string; active: boolean; label: string; onClick?: () => void; children: ReactNode }) {
  const className = cx("relative flex h-[52px] min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-[20px] text-[10.5px] transition-colors duration-200 active:scale-95", active ? "font-semibold text-accent" : "font-medium text-faint");
  const inner = (
    <>
      {active && <motion.span layoutId="tab-active" transition={SPRING} className="absolute inset-0 rounded-[20px] bg-accent/12" />}
      <span className="relative">{children}</span>
      <span className="relative max-w-full truncate px-1">{label}</span>
    </>
  );
  return target ? (
    <a href={target} onClick={onClick} className={className} aria-current={active ? "page" : undefined}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

/** The hunt is running: a pulsing dot, with the number of cars found so far. */
function RunningDot({ count }: { count: number }) {
  return count > 0 ? (
    <span className="num bg-brand grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold text-white shadow-glow">{count}</span>
  ) : (
    <span className="relative flex size-2.5">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/60" />
      <span className="relative inline-flex size-2.5 rounded-full bg-accent ring-2 ring-surface" />
    </span>
  );
}

/** Whether the AI is on, and how much of today's allowance is used. */
function AiStatus() {
  const { meta } = useApp();
  const t = useT();
  const prefs = useStore(prefsStore);
  if (!meta) return null;
  const on = meta.ai_available && prefs.ai_enabled;
  const usage = meta.account?.usage?.ai;
  const showUsage = usage && on && !meta.account?.admin;
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="relative flex size-2">
          {on && <span className="absolute inline-flex size-full animate-ping rounded-full bg-good/60" />}
          <span className={cx("relative inline-flex size-2 rounded-full", on ? "bg-good" : "bg-faint")} />
        </span>
        <span className="flex-1">{on ? t("ai_on") : t(meta.ai_available ? "ai_off" : "ai_unavailable_note")}</span>
        {showUsage && (
          <span className="num font-medium">
            {usage.used}/{usage.limit}
          </span>
        )}
      </div>
      {showUsage && <ProgressLine className="mt-2 h-1" value={usage.limit ? usage.used / usage.limit : 0} />}
    </div>
  );
}
