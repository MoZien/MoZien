import { Columns3, Crown, Plus, X } from "lucide-react";
import { useState } from "react";
import { CarPhoto } from "../components/CarCard";
import { PurposeSwitch } from "../components/PurposeSwitch";
import { scoreText } from "../components/charts";
import { Badge, Button, Card, EmptyState, IconButton, Modal, cx } from "../components/ui";
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("compare_title")}</h1>
        <div className="flex items-center gap-2">
          <PurposeSwitch compact tiny />
          {cars.length > 0 && (
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setPicking(true)} disabled={ids.length >= 4}>
              {t("compare_pick")}
            </Button>
          )}
        </div>
      </div>
      {cars.length === 0 ? (
        <Card>
          <EmptyState icon={<Columns3 className="size-6" />} title={t("compare_title")} text={t("compare_empty")} action={<Button onClick={() => setPicking(true)}>{t("compare_pick")}</Button>} />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr>
                <th className="w-40 p-4" />
                {cars.map((car) => (
                  <th key={car.id} className="p-3 align-top font-normal">
                    <div className="relative">
                      <IconButton label={t("remove")} className="absolute end-1 top-1 z-10 bg-surface/80" onClick={() => compareStore.set((list) => list.filter((id) => id !== car.id))}>
                        <X className="size-4" />
                      </IconButton>
                      <button className="block w-full cursor-pointer text-start" onClick={() => navigate("analyze", car.id)}>
                        <CarPhoto src={car.result.listing.images?.[0] ?? ""} className="h-28 w-full rounded-xl" />
                        <div className="mt-2 line-clamp-2 text-sm font-semibold" dir="auto">
                          {car.result.listing.title}
                        </div>
                      </button>
                      {verdictOf(car.result, view, t, true) && <Badge tone={verdictOf(car.result, view, t, true)!.tone} className="mt-1.5">{verdictOf(car.result, view, t, true)!.label}</Badge>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const top = best(row);
                return (
                  <tr key={row.label} className="border-t border-line">
                    <td className="p-3 ps-4 text-muted">{row.label}</td>
                    {cars.map((car) => {
                      const isBest = top != null && row.value(car.result) === top;
                      return (
                        <td key={car.id} className={cx("p-3", isBest && "bg-good/8 font-semibold text-good")}>
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
                className={cx("flex w-full cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-start transition", selected ? "border-text bg-surface-2" : "border-line hover:bg-surface-2")}
              >
                <CarPhoto src={car.result.listing.images?.[0] ?? ""} className="size-12 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" dir="auto">
                    {car.result.listing.title}
                  </span>
                  <span className="num text-xs text-muted">{euro(car.result.listing.price)}</span>
                </span>
                {selected && <Badge tone="accent">✓</Badge>}
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
