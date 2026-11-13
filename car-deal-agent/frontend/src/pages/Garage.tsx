import { BadgeEuro, Download, Pencil, Percent, Plus, Target, Timer, Trash2, TrendingUp, Wallet, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { CarPhoto } from "../components/CarCard";
import { Bars } from "../components/charts";
import { CountUp, Reveal, Stagger, StaggerItem } from "../components/motion";
import { Badge, Button, Card, CardHeader, EmptyState, Field, type Hue, IconButton, IconTile, Input, Modal, NumberInput, PageTitle, Textarea, cx } from "../components/ui";
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
    <div className="space-y-5 lg:space-y-6">
      <PageTitle
        icon={<BadgeEuro className="size-6" />}
        hue="good"
        title={t("garage_title")}
        sub={t("garage_sub")}
        action={
          <div className="flex gap-2">
            {cars.length > 0 && (
              <Button icon={<Download className="size-4" />} onClick={exportCsv} aria-label={t("export_csv")}>
                <span className="hidden sm:inline">{t("export_csv")}</span>
              </Button>
            )}
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(blank())}>
              <span className="hidden sm:inline">{t("garage_add")}</span>
            </Button>
          </div>
        }
      />

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1" delay={0.05}>
        <Kpi hue="good" icon={<TrendingUp className="size-[18px]" />} label={t("realized")} value={<CountUp value={stats.realized} format={euro} />} tone={stats.realized >= 0 ? "text-good" : "text-bad"} />
        <Kpi hue="accent" icon={<Target className="size-[18px]" />} label={t("expected_profit")} value={<CountUp value={stats.expected} format={euro} />} tone="text-accent" />
        <Kpi hue="neutral" icon={<Wallet className="size-[18px]" />} label={t("invested")} value={<CountUp value={stats.invested} format={euro} />} />
        <Kpi hue="violet" icon={<Percent className="size-[18px]" />} label={t("avg_roi")} value={stats.roi == null ? "–" : <CountUp value={stats.roi} format={(n) => pct(n)} />} />
        <Kpi hue="cyan" icon={<Timer className="size-[18px]" />} label={t("avg_days")} value={stats.days == null ? "–" : <><CountUp value={stats.days} /> <span className="text-sm font-medium text-muted">{t("days")}</span></>} />
      </Stagger>

      {cars.some((c) => c.soldPrice != null) && (
        <Reveal delay={0.1}>
          <Card className="p-4 sm:p-5">
            <CardHeader title={t("profit_per_car")} icon={<BadgeEuro className="size-4" />} />
            <div className="mt-4">
              <Bars data={cars.filter((c) => c.soldPrice != null).map((c) => ({ label: c.title, value: profitOf(c) }))} />
            </div>
          </Card>
        </Reveal>
      )}

      {cars.length === 0 ? (
        <Card>
          <EmptyState icon={<BadgeEuro className="size-8" />} title={t("garage_title")} text={t("garage_empty")} action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(blank())}>{t("garage_add")}</Button>} />
        </Card>
      ) : (
        <Stagger className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4" delay={0.12}>
          {cars.map((car) => {
            const sold = car.soldPrice != null;
            const profit = sold ? profitOf(car) : car.askingPrice ? profitOf(car, car.askingPrice) : null;
            return (
              <StaggerItem key={car.id}>
                <Card className="flex h-full gap-3.5 p-3">
                  <CarPhoto src={car.image} className="size-24 shrink-0 rounded-2xl" />
                  <div className="min-w-0 flex-1 py-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-semibold" dir="auto">{car.title || "—"}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge tone={sold ? "good" : "accent"}>{sold ? t("sold") : t("owned")}</Badge>
                          <span className="num text-xs text-faint">{daysBetween(car.boughtAt, car.soldAt)} {t("days")}</span>
                        </div>
                      </div>
                      <div className="-me-1 -mt-1 flex">
                        <IconButton label={t("edit")} className="size-9" onClick={() => setEditing(car)}><Pencil className="size-4" /></IconButton>
                        <IconButton label={t("delete")} className="size-9" onClick={() => (!ui.confirmDelete || window.confirm(t("confirm_delete"))) && garageStore.set((list) => list.filter((c) => c.id !== car.id))}><Trash2 className="size-4" /></IconButton>
                      </div>
                    </div>
                    <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-2 text-xs ring-1 ring-line">
                      <div className="min-w-0"><div className="truncate text-faint">{t("bought_price")}</div><div className="num mt-0.5 font-semibold">{euro(car.boughtPrice)}</div></div>
                      <div className="min-w-0"><div className="truncate text-faint">{t("extra_costs")}</div><div className="num mt-0.5 font-semibold">{euro(costsOf(car))}</div></div>
                      <div className="min-w-0">
                        <div className="truncate text-faint">{sold ? t("realized") : t("expected_profit")}</div>
                        <div className={cx("num mt-0.5 font-bold", profit == null ? "" : profit >= 0 ? "text-good" : "text-bad")}>{profit == null ? "–" : euro(profit)}</div>
                      </div>
                    </div>
                  </div>
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}

      <Modal open={editing != null} onClose={() => setEditing(null)} title={editing?.title || t("garage_add")}>
        {editing && <GarageForm car={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

/** One figure of the garage with its icon. */
function Kpi({ icon, label, value, hue, tone }: { icon: ReactNode; label: string; value: ReactNode; hue: Hue; tone?: string }) {
  return (
    <StaggerItem>
      <Card className="flex h-full flex-col gap-2 p-3.5 sm:p-4">
        <IconTile hue={hue} size="sm">
          {icon}
        </IconTile>
        <div className={cx("truncate text-[22px] font-bold leading-none tracking-tight", tone)}>{value}</div>
        <div className="text-xs leading-tight text-muted">{label}</div>
      </Card>
    </StaggerItem>
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
      <div className="flex items-center justify-between rounded-2xl bg-surface-2 p-3.5 text-sm ring-1 ring-line">
        <span className="text-muted">{draft.soldPrice != null ? t("realized") : t("expected_profit")}</span>
        <span className="num font-semibold">{euro(profitOf(draft, draft.soldPrice ?? draft.askingPrice))}</span>
      </div>
      <Button type="submit" variant="primary" size="lg" className="w-full">{t("save")}</Button>
    </form>
  );
}
