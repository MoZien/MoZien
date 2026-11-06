import { BadgeEuro, Download, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CarPhoto } from "../components/CarCard";
import { Bars } from "../components/charts";
import { Badge, Button, Card, CardHeader, EmptyState, Field, IconButton, Input, Modal, NumberInput, Stat, Textarea, cx } from "../components/ui";
import { euro, pct } from "../lib/format";
import { useT } from "../lib/i18n";
import { type GarageCar, garageStore, uiStore, uid, useStore } from "../lib/store";

const costsOf = (car: GarageCar) => car.costs.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
const profitOf = (car: GarageCar, price = car.soldPrice) => (price ?? 0) - car.boughtPrice - costsOf(car);
const daysBetween = (from: string, to: string | null) => Math.max(0, Math.round((new Date(to ?? Date.now()).getTime() - new Date(from).getTime()) / 86400000));

export function GaragePage() {
  const t = useT();
  const cars = useStore(garageStore);
  const ui = useStore(uiStore);
  const [editing, setEditing] = useState<GarageCar | null>(null);

  const stats = useMemo(() => {
    const sold = cars.filter((c) => c.soldPrice != null);
    const owned = cars.filter((c) => c.soldPrice == null);
    const rois = sold.map((c) => profitOf(c) / Math.max(c.boughtPrice + costsOf(c), 1));
    return {
      invested: owned.reduce((sum, c) => sum + c.boughtPrice + costsOf(c), 0),
      realized: sold.reduce((sum, c) => sum + profitOf(c), 0),
      roi: rois.length ? rois.reduce((a, b) => a + b, 0) / rois.length : null,
      days: sold.length ? Math.round(sold.reduce((sum, c) => sum + daysBetween(c.boughtAt, c.soldAt), 0) / sold.length) : null,
      expected: owned.reduce((sum, c) => sum + (c.askingPrice ? profitOf(c, c.askingPrice) : 0), 0),
    };
  }, [cars]);

  function exportCsv() {
    const header = ["title", "bought_at", "bought_price", "costs", "sold_at", "sold_price", "profit", "url"];
    const lines = cars.map((c) => [c.title, c.boughtAt, c.boughtPrice, costsOf(c), c.soldAt ?? "", c.soldPrice ?? "", c.soldPrice != null ? profitOf(c) : "", c.url]
      .map((v) => `"${String(v).replaceAll('"', '""')}"`).join(";"));
    const blob = new Blob([[header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "garage.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const blank = (): GarageCar => ({ id: uid(), title: "", url: "", image: "", boughtPrice: 0, boughtAt: new Date().toISOString().slice(0, 10), costs: [], askingPrice: null, soldPrice: null, soldAt: null, notes: "" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold leading-tight lg:text-[28px]">{t("garage_title")}</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{t("garage_sub")}</p>
        </div>
        <div className="flex gap-2">
          {cars.length > 0 && (
            <Button icon={<Download className="size-4" />} onClick={exportCsv}>
              {t("export_csv")}
            </Button>
          )}
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(blank())}>
            {t("garage_add")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
        <Card className="p-4"><Stat label={t("realized")} value={<span className="num">{euro(stats.realized)}</span>} tone={stats.realized >= 0 ? "good" : "bad"} /></Card>
        <Card className="p-4"><Stat label={t("expected_profit")} value={<span className="num">{euro(stats.expected)}</span>} tone="accent" /></Card>
        <Card className="p-4"><Stat label={t("invested")} value={<span className="num">{euro(stats.invested)}</span>} /></Card>
        <Card className="p-4"><Stat label={t("avg_roi")} value={<span className="num">{stats.roi == null ? "–" : pct(stats.roi)}</span>} /></Card>
        <Card className="p-4"><Stat label={t("avg_days")} value={<span className="num">{stats.days == null ? "–" : `${stats.days} ${t("days")}`}</span>} /></Card>
      </div>

      {cars.some((c) => c.soldPrice != null) && (
        <Card className="p-5">
          <CardHeader title={t("profit_per_car")} icon={<BadgeEuro className="size-4" />} />
          <div className="mt-4">
            <Bars data={cars.filter((c) => c.soldPrice != null).map((c) => ({ label: c.title, value: profitOf(c) }))} />
          </div>
        </Card>
      )}

      {cars.length === 0 ? (
        <Card>
          <EmptyState icon={<BadgeEuro className="size-6" />} title={t("garage_title")} text={t("garage_empty")} action={<Button variant="primary" onClick={() => setEditing(blank())}>{t("garage_add")}</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {cars.map((car) => {
            const sold = car.soldPrice != null;
            const profit = sold ? profitOf(car) : car.askingPrice ? profitOf(car, car.askingPrice) : null;
            return (
              <Card key={car.id} className="flex gap-4 p-4">
                <CarPhoto src={car.image} className="size-20 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold" dir="auto">{car.title || "—"}</div>
                      <Badge tone={sold ? "good" : "accent"} className="mt-1">{sold ? t("sold") : t("owned")}</Badge>
                      <span className="num ms-2 text-xs text-faint">{daysBetween(car.boughtAt, car.soldAt)} {t("days")}</span>
                    </div>
                    <div className="flex">
                      <IconButton label={t("edit")} onClick={() => setEditing(car)}><Pencil className="size-4" /></IconButton>
                      <IconButton label={t("delete")} onClick={() => (!ui.confirmDelete || window.confirm(t("confirm_delete"))) && garageStore.set((list) => list.filter((c) => c.id !== car.id))}><Trash2 className="size-4" /></IconButton>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div><div className="text-faint">{t("bought_price")}</div><div className="num font-semibold">{euro(car.boughtPrice)}</div></div>
                    <div><div className="text-faint">{t("extra_costs")}</div><div className="num font-semibold">{euro(costsOf(car))}</div></div>
                    <div>
                      <div className="text-faint">{sold ? t("realized") : t("expected_profit")}</div>
                      <div className={cx("num font-semibold", profit == null ? "" : profit >= 0 ? "text-good" : "text-bad")}>{profit == null ? "–" : euro(profit)}</div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={editing != null} onClose={() => setEditing(null)} title={editing?.title || t("garage_add")}>
        {editing && <GarageForm car={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function GarageForm({ car, onDone }: { car: GarageCar; onDone: () => void }) {
  const t = useT();
  const [draft, setDraft] = useState<GarageCar>(car);
  const set = (patch: Partial<GarageCar>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        garageStore.set((list) => (list.some((c) => c.id === draft.id) ? list.map((c) => (c.id === draft.id ? draft : c)) : [draft, ...list]));
        onDone();
      }}
    >
      <Field label={t("title")}><Input value={draft.title} onChange={(e) => set({ title: e.target.value })} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("bought_price")}><NumberInput value={draft.boughtPrice} onChange={(v) => set({ boughtPrice: v ?? 0 })} suffix="€" /></Field>
        <Field label={t("bought_at")}><Input type="date" value={draft.boughtAt} onChange={(e) => set({ boughtAt: e.target.value })} /></Field>
        <Field label={t("asking_now")}><NumberInput value={draft.askingPrice} onChange={(v) => set({ askingPrice: v })} suffix="€" allowEmpty /></Field>
        <div />
        <Field label={t("sold_price")}><NumberInput value={draft.soldPrice} onChange={(v) => set({ soldPrice: v, soldAt: v != null ? draft.soldAt ?? new Date().toISOString().slice(0, 10) : null })} suffix="€" allowEmpty /></Field>
        <Field label={t("sold_at")}><Input type="date" value={draft.soldAt ?? ""} onChange={(e) => set({ soldAt: e.target.value || null })} /></Field>
      </div>
      <div>
        <div className="mb-2 text-[13px] font-medium text-muted">{t("extra_costs")}</div>
        <div className="space-y-2">
          {draft.costs.map((cost, i) => (
            <div key={i} className="flex gap-2">
              <Input value={cost.label} placeholder={t("cost_label")} onChange={(e) => set({ costs: draft.costs.map((c, j) => (j === i ? { ...c, label: e.target.value } : c)) })} />
              <NumberInput className="w-36 shrink-0" value={cost.amount} suffix="€" onChange={(v) => set({ costs: draft.costs.map((c, j) => (j === i ? { ...c, amount: v ?? 0 } : c)) })} />
              <IconButton label={t("delete")} onClick={() => set({ costs: draft.costs.filter((_, j) => j !== i) })}><X className="size-4" /></IconButton>
            </div>
          ))}
          <Button type="button" size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set({ costs: [...draft.costs, { label: "", amount: 0 }] })}>{t("add_cost")}</Button>
        </div>
      </div>
      <Field label={t("notes")}><Textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      <div className="flex items-center justify-between rounded-xl bg-surface-2 p-3 text-sm">
        <span className="text-muted">{draft.soldPrice != null ? t("realized") : t("expected_profit")}</span>
        <span className="num font-semibold">{euro(profitOf(draft, draft.soldPrice ?? draft.askingPrice))}</span>
      </div>
      <Button type="submit" variant="primary" className="w-full">{t("save")}</Button>
    </form>
  );
}
