import { Check, Columns3, Crown, Plus, X } from "lucide-react";
import { useState } from "react";
import { CarPhoto } from "../components/CarCard";
import { PurposeSwitch } from "../components/PurposeSwitch";
import { scoreText } from "../components/charts";
import { VerdictPill } from "../components/CarCard";
import { Reveal } from "../components/motion";
import { Button, Card, EmptyState, IconButton, Modal, PageTitle, cx } from "../components/ui";
import { euro, km, pct, registration } from "../lib/format";
import { type TextKey, useT } from "../lib/i18n";
import { discountOf, verdictOf } from "../lib/result";
import { navigate } from "../lib/router";
import { compareStore, prefsStore, savedStore, useStore } from "../lib/store";
import type { Result } from "../lib/types";

interface RowSpec {
  label: string;
  value: (r: Result) => number | null;
  show: (r: Result) => React.ReactNode;
  better?: "high" | "low";
}

export function ComparePage() {
  const t = useT();
  const prefs = useStore(prefsStore);
  const saved = useStore(savedStore);
  const ids = useStore(compareStore);
  const [picking, setPicking] = useState(false);
  const cars = ids.map((id) => saved.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => c != null);
  const view = prefs.purpose;

  const rows: RowSpec[] = [
    { label: t("score"), value: (r) => verdictOf(r, view, t)?.score ?? null, show: (r) => <span className={cx("num font-semibold", scoreText(verdictOf(r, view, t)?.score ?? 0))}>{verdictOf(r, view, t)?.score ?? "–"}</span>, better: "high" },
    { label: t("asking_price"), value: (r) => r.listing.price, show: (r) => <span className="num">{euro(r.listing.price)}</span>, better: "low" },
    { label: t("market_price"), value: (r) => r.valuation.market_price, show: (r) => <span className="num">{euro(r.valuation.market_price)}</span> },
    { label: t("below_market"), value: (r) => discountOf(r), show: (r) => <span className="num">{discountOf(r) == null ? "–" : pct(discountOf(r))}</span>, better: "high" },
    ...(view === "trade"
      ? [
          { label: t("profit"), value: (r: Result) => r.trade?.profit ?? null, show: (r: Result) => <span className="num">{euro(r.trade?.profit)}</span>, better: "high" as const },
          { label: t("roi"), value: (r: Result) => r.trade?.roi ?? null, show: (r: Result) => <span className="num">{pct(r.trade?.roi)}</span>, better: "high" as const },
          { label: t("max_buy", { profit: euro(prefs.min_profit) }), value: (r: Result) => r.trade?.max_buy_price ?? null, show: (r: Result) => <span className="num">{euro(r.trade?.max_buy_price)}</span> },
        ]
      : [
          { label: t("offer_max"), value: (r: Result) => r.personal?.offer_max ?? null, show: (r: Result) => <span className="num">{euro(r.personal?.offer_max)}</span>, better: "low" as const },
          { label: t("first_year"), value: (r: Result) => r.personal?.first_year_cost ?? null, show: (r: Result) => <span className="num">{euro(r.personal?.first_year_cost)}</span>, better: "low" as const },
          { label: t("fuel_year"), value: (r: Result) => r.personal?.fuel_per_year ?? null, show: (r: Result) => <span className="num">{euro(r.personal?.fuel_per_year)}</span>, better: "low" as const },
          { label: t("reliability"), value: (r: Result) => (r.analysis_kind === "personal" ? r.analysis?.reliability ?? null : null), show: (r: Result) => <span className="num">{r.analysis_kind === "personal" && r.analysis?.reliability ? `${r.analysis.reliability}/5` : "–"}</span>, better: "high" as const },
        ]),
    { label: t("mileage"), value: (r) => r.listing.km, show: (r) => <span className="num">{km(r.listing.km)}</span>, better: "low" },
    { label: t("first_reg"), value: (r) => (r.listing.year ?? 0) * 12 + (r.listing.month ?? 6), show: (r) => <span className="num">{registration(r.listing.month, r.listing.year)}</span>, better: "high" },
    { label: t("power"), value: (r) => r.listing.power_ps, show: (r) => <span className="num">{r.listing.power_ps ? `${r.listing.power_ps} PS` : "–"}</span>, better: "high" },
    { label: t("fuel"), value: () => null, show: (r) => r.listing.fuel || "–" },
    { label: t("gearbox"), value: () => null, show: (r) => r.listing.gearbox || "–" },
    { label: t("tuv"), value: () => null, show: (r) => <span className="num">{r.listing.hu_until || "–"}</span> },
    { label: t("confidence"), value: () => null, show: (r) => t(`conf_${r.valuation.confidence}` as TextKey) },
  ];

  const best = (row: RowSpec) => {
    if (!row.better || cars.length < 2) return null;
    const values = cars.map((c) => row.value(c.result)).filter((v): v is number => v != null);
    if (!values.length) return null;
    return row.better === "high" ? Math.max(...values) : Math.min(...values);
  };

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageTitle
        icon={<Columns3 className="size-6" />}
        hue="cyan"
        title={t("compare_title")}
        sub={t("nav_compare_sub")}
        action={
          cars.length > 0 && (
            <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setPicking(true)} disabled={ids.length >= 4}>
              <span className="hidden sm:inline">{t("compare_pick")}</span>
            </Button>
          )
        }
      />
      {cars.length > 0 && <PurposeSwitch compact />}
      {cars.length === 0 ? (
        <Card>
          <EmptyState icon={<Columns3 className="size-8" />} title={t("compare_title")} text={t("compare_empty")} action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setPicking(true)}>{t("compare_pick")}</Button>} />
        </Card>
      ) : (
        <Reveal delay={0.06}>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky start-0 z-10 w-36 bg-surface p-4" />
                  {cars.map((car) => {
                    const verdict = verdictOf(car.result, view, t, true);
                    return (
                      <th key={car.id} className="p-3 align-top font-normal">
                        <div className="relative">
                          <IconButton label={t("remove")} className="absolute end-1.5 top-1.5 z-10 size-8 rounded-full bg-white/90 text-[#0b1324] shadow-md backdrop-blur" onClick={() => compareStore.set((list) => list.filter((id) => id !== car.id))}>
                            <X className="size-4" />
                          </IconButton>
                          <button className="group block w-full cursor-pointer text-start" onClick={() => navigate("analyze", car.id)}>
                            <span className="block overflow-hidden rounded-2xl">
                              <CarPhoto src={car.result.listing.images?.[0] ?? ""} className="h-32 w-full transition-transform duration-500 group-hover:scale-105" />
                            </span>
                            <div className="mt-2.5 line-clamp-2 text-sm font-semibold" dir="auto">
                              {car.result.listing.title}
                            </div>
                          </button>
                          {verdict && <VerdictPill tone={verdict.tone} label={verdict.label} className="mt-2" />}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const top = best(row);
                  return (
                    <tr key={row.label}>
                      <td className="sticky start-0 z-10 border-t border-line bg-surface p-3 ps-4 text-[13px] text-muted">{row.label}</td>
                      {cars.map((car) => {
                        const isBest = top != null && row.value(car.result) === top;
                        return (
                          <td key={car.id} className={cx("border-t border-line p-3", isBest && "bg-good/8 font-semibold text-good")}>
                            <span className="inline-flex items-center gap-1.5">
                              {row.show(car.result)}
                              {isBest && <Crown className="size-3.5" />}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </Reveal>
      )}
      <Modal open={picking} onClose={() => setPicking(false)} title={t("compare_pick")}>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {saved.length === 0 && <p className="text-sm text-muted">{t("no_analyses")}</p>}
          {saved.map((car) => {
            const selected = ids.includes(car.id);
            return (
              <button
                key={car.id}
                onClick={() => compareStore.set((list) => (selected ? list.filter((id) => id !== car.id) : [...list, car.id].slice(-4)))}
                className={cx("flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-2.5 text-start transition active:scale-[0.98]", selected ? "border-accent bg-accent/8 ring-4 ring-accent/10" : "border-line hover:bg-surface-2")}
              >
                <CarPhoto src={car.result.listing.images?.[0] ?? ""} className="size-14 shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" dir="auto">
                    {car.result.listing.title}
                  </span>
                  <span className="num text-xs text-muted">{euro(car.result.listing.price)}</span>
                </span>
                {selected && <span className="bg-brand animate-pop grid size-6 shrink-0 place-items-center rounded-full text-white"><Check className="size-3.5" strokeWidth={3} /></span>}
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
