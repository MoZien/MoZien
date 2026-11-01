import { ArrowLeft, ArrowRight, BadgeEuro, Columns3, FileSearch, Gauge, Lightbulb, Radar, ScanSearch, Sparkles, TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";
import { CarCard } from "../components/CarCard";
import { PurposeCards } from "../components/PurposeSwitch";
import { Button, Card, EmptyState, Stat } from "../components/ui";
import { euro, pct } from "../lib/format";
import { type TextKey, useT } from "../lib/i18n";
import { discountOf, isGood } from "../lib/result";
import { href, navigate } from "../lib/router";
import { garageStore, prefsStore, savedStore, uiStore, useStore } from "../lib/store";
import { extractAdUrl } from "./Analyze";
import { useApp } from "../lib/app";

export function garageTotals(cars: ReturnType<typeof garageStore.get>) {
  const sold = cars.filter((car) => car.soldPrice != null);
  const profitOf = (car: (typeof cars)[number]) => (car.soldPrice ?? 0) - car.boughtPrice - car.costs.reduce((sum, c) => sum + (c.amount || 0), 0);
  return {
    sold,
    realized: sold.reduce((sum, car) => sum + profitOf(car), 0),
    profitOf,
  };
}

export function DashboardPage() {
  const t = useT();
  const { meta } = useApp();
  const prefs = useStore(prefsStore);
  const ui = useStore(uiStore);
  const saved = useStore(savedStore);
  const garage = useStore(garageStore);
  const [url, setUrl] = useState("");
  const Arrow = t.lang === "ar" ? ArrowLeft : ArrowRight;

  const stats = useMemo(() => {
    const discounts = saved.map((car) => discountOf(car.result)).filter((d): d is number => d != null);
    return {
      count: saved.length,
      good: saved.filter((car) => isGood(car.result, car.result.purpose)).length,
      avgDiscount: discounts.length ? discounts.reduce((a, b) => a + b, 0) / discounts.length : null,
      garage: garageTotals(garage).realized,
    };
  }, [saved, garage]);

  const tips: TextKey[] = ["tip_1", "tip_2", "tip_3", "tip_4"];
  const tip = tips[new Date().getDate() % tips.length];
  const recent = saved.slice(0, 6);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <div className="pointer-events-none absolute -end-24 -top-24 size-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -start-16 size-64 rounded-full bg-accent-2/20 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            <Sparkles className="size-3.5" /> {meta?.app_name ?? "AutoHalle"}
          </span>
          <h1 className="mt-4 max-w-2xl text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            <span className="gradient-text">{t("hero_title")}</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{t("hero_sub")}</p>
          <form
            className="mt-6 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              const found = extractAdUrl(url);
              navigate("analyze", null, found ? { url: found } : undefined);
            }}
          >
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={t("url_placeholder")}
              dir="ltr"
              aria-label={t("url_placeholder")}
              className="h-12 flex-1 rounded-xl border border-line bg-surface-2/70 px-4 text-sm outline-none transition focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/10"
            />
            <Button type="submit" variant="primary" size="lg" icon={<ScanSearch className="size-4" />}>
              {t("analyze")}
            </Button>
          </form>
          <div className="mt-4">
            <PurposeCards value={prefs.purpose} onChange={(purpose) => prefsStore.set((p) => ({ ...p, purpose }))} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <Stat label={t("kpi_analyses")} value={<span className="num">{stats.count}</span>} icon={<FileSearch className="size-3.5" />} />
        </Card>
        <Card className="p-4">
          <Stat label={t("kpi_good")} value={<span className="num">{stats.good}</span>} tone="good" icon={<Sparkles className="size-3.5" />} />
        </Card>
        <Card className="p-4">
          <Stat label={t("kpi_avg_discount")} value={<span className="num">{stats.avgDiscount == null ? "–" : pct(stats.avgDiscount)}</span>} icon={<TrendingDown className="size-3.5" />} />
        </Card>
        <Card className="p-4">
          <Stat label={t("kpi_garage_profit")} value={<span className="num">{euro(stats.garage)}</span>} tone={stats.garage >= 0 ? "good" : "bad"} icon={<BadgeEuro className="size-3.5" />} />
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">{t("quick_actions")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { page: "hunt", label: t("qa_hunt"), icon: <Radar className="size-5" /> },
            { page: "valuate", label: t("qa_valuate"), icon: <Gauge className="size-5" /> },
            { page: "tools", label: t("qa_scan"), icon: <FileSearch className="size-5" />, query: { tool: "scan" } },
            { page: "compare", label: t("qa_compare"), icon: <Columns3 className="size-5" /> },
          ].map((action) => (
            <a key={action.page} href={href(action.page, null, action.query)} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-accent/40">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">{action.icon}</span>
              <span className="flex-1 text-sm font-semibold">{action.label}</span>
              <Arrow className="size-4 text-faint transition group-hover:text-accent" />
            </a>
          ))}
        </div>
      </section>

      {ui.tips && (
        <Card className="flex items-start gap-3 p-4">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-warn" />
          <div className="text-sm">
            <span className="font-semibold">{t("tip")}: </span>
            <span className="text-muted">{t(tip)}</span>
          </div>
        </Card>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">{t("recent")}</h2>
          {saved.length > 0 && (
            <a href={href("saved")} className="text-sm font-medium text-accent hover:underline">
              {t("see_all")}
            </a>
          )}
        </div>
        {recent.length === 0 ? (
          <Card>
            <EmptyState icon={<ScanSearch className="size-6" />} title={t("empty")} text={t("no_analyses")} />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recent.map((car) => (
              <CarCard key={car.id} result={car.result} favorite={car.favorite} onClick={() => navigate("analyze", car.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
