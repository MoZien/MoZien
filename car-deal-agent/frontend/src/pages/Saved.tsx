import { Columns3, Flame, Heart, History, Search, Trash2, TrendingDown, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CarCard } from "../components/CarCard";
import { Sparkline } from "../components/charts";
import { Badge, Button, Card, Disclosure, EmptyState, IconButton, Modal, Select, Tabs, Textarea, cx } from "../components/ui";
import { euro, relativeDate } from "../lib/format";
import { type TextKey, useT } from "../lib/i18n";
import { discountOf, isGood } from "../lib/result";
import { type Route, navigate } from "../lib/router";
import { type SavedCar, type SavedStatus, compareStore, savedStore, uiStore, updateSaved, useStore } from "../lib/store";

const STATUSES: SavedStatus[] = ["watching", "contacted", "viewing", "bought", "passed"];

type Tab = "favorites" | "history";
type Sort = "date" | "score" | "discount" | "price";

export function SavedPage({ route }: { route: Route }) {
  const t = useT();
  const saved = useStore(savedStore);
  const compare = useStore(compareStore);
  const ui = useStore(uiStore);
  // Links from the start page open a given tab, sort or "only good deals" (#/saved?tab=history&only=good).
  const asked = (): { tab: Tab; sort: Sort; onlyGood: boolean } => {
    const tab = route.query.get("tab");
    const sort = route.query.get("sort");
    return {
      tab: tab === "history" || tab === "favorites" ? tab : saved.some((c) => c.favorite) ? "favorites" : "history",
      sort: sort === "score" || sort === "discount" || sort === "price" ? sort : "date",
      onlyGood: route.query.get("only") === "good",
    };
  };
  const [tab, setTab] = useState<Tab>(() => asked().tab);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>(() => asked().sort);
  const [onlyGood, setOnlyGood] = useState(() => asked().onlyGood);
  const [purpose, setPurpose] = useState<"all" | "personal" | "trade">("all");
  const [status, setStatus] = useState<"all" | SavedStatus>("all");
  const [editing, setEditing] = useState<SavedCar | null>(null);

  const routeKey = route.query.toString();
  useEffect(() => {
    if (!routeKey) return;
    const next = asked();
    setTab(next.tab);
    setSort(next.sort);
    setOnlyGood(next.onlyGood);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = saved.filter(
      (car) =>
        (tab === "history" || car.favorite) &&
        (!onlyGood || isGood(car.result, car.result.purpose)) &&
        (purpose === "all" || car.result.purpose === purpose) &&
        (status === "all" || car.status === status) &&
        (!q || `${car.result.listing.title} ${car.result.listing.location} ${car.notes}`.toLowerCase().includes(q)),
    );
    const score = (car: SavedCar) => (car.result.purpose === "trade" ? car.result.trade?.score : car.result.personal?.score) ?? 0;
    const sorters = {
      date: (a: SavedCar, b: SavedCar) => b.updatedAt.localeCompare(a.updatedAt),
      score: (a: SavedCar, b: SavedCar) => score(b) - score(a),
      discount: (a: SavedCar, b: SavedCar) => (discountOf(b.result) ?? -9) - (discountOf(a.result) ?? -9),
      price: (a: SavedCar, b: SavedCar) => (a.result.listing.price ?? 1e9) - (b.result.listing.price ?? 1e9),
    };
    return items.sort(sorters[sort]);
  }, [saved, tab, query, sort, onlyGood, purpose, status]);

  function remove(car: SavedCar) {
    if (ui.confirmDelete && !window.confirm(t("confirm_delete"))) return;
    savedStore.set((cars) => cars.filter((c) => c.id !== car.id));
    compareStore.set((ids) => ids.filter((id) => id !== car.id));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold leading-tight">{t("nav_saved")}</h1>
        {compare.length > 0 && (
          <Button size="sm" icon={<Columns3 className="size-4" />} onClick={() => navigate("compare")}>
            {t("nav_compare")} ({compare.length})
          </Button>
        )}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "favorites", label: t("favorites"), badge: <span className="num text-xs text-faint">{saved.filter((c) => c.favorite).length}</span> },
          { value: "history", label: t("history"), badge: <span className="num text-xs text-faint">{saved.length}</span> },
        ]}
      />
      <div className="space-y-1">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search_saved")}
            className="h-11 w-full rounded-xl border border-line bg-surface ps-9 pe-3 text-sm outline-none focus:border-muted"
          />
        </div>
        <Disclosure title={t("sort_filter")}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t("sort")} className="h-10">
              <option value="date">{t("sort_date")}</option>
              <option value="score">{t("sort_score")}</option>
              <option value="discount">{t("sort_discount")}</option>
              <option value="price">{t("sort_price")}</option>
            </Select>
        <Select value={purpose} onChange={(e) => setPurpose(e.target.value as typeof purpose)} aria-label={t("purpose")} className="h-10">
          <option value="all">{t("purpose")}: {t("all")}</option>
          <option value="personal">{t("purpose_personal_short")}</option>
          <option value="trade">{t("purpose_trade_short")}</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label={t("status")} className="h-10">
          <option value="all">{t("status")}: {t("all")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status_${s}` as TextKey)}
            </option>
          ))}
        </Select>
          </div>
        </Disclosure>
        {(onlyGood || sort !== "date") && (
          <div className="flex flex-wrap gap-2 pt-1">
            {onlyGood && (
              <button onClick={() => setOnlyGood(false)} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium">
                <Flame className="size-3.5" /> {t("only_good")} <X className="size-3.5" aria-label={t("remove_filter")} />
              </button>
            )}
            {sort !== "date" && (
              <button onClick={() => setSort("date")} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium">
                <TrendingDown className="size-3.5" /> {t(`sort_${sort}` as TextKey)} <X className="size-3.5" aria-label={t("remove_filter")} />
              </button>
            )}
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={onlyGood ? <Flame className="size-6" /> : tab === "favorites" ? <Heart className="size-6" /> : <History className="size-6" />}
            title={t("empty")}
            text={t(onlyGood ? "no_good_deals" : tab === "favorites" ? "no_favorites" : "no_analyses")}
            action={
              onlyGood ? (
                <Button onClick={() => navigate("hunt")}>{t("qa_hunt")}</Button>
              ) : (
                <Button onClick={() => navigate("analyze")}>{t("nav_analyze")}</Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((car) => {
            const prices = car.priceHistory.map((p) => p.price).filter((p): p is number => p != null);
            const dropped = prices.length > 1 && prices[prices.length - 1] < prices[0];
            return (
              <CarCard
                key={car.id}
                result={car.result}
                favorite={car.favorite}
                onClick={() => navigate("analyze", car.id)}
                footer={
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditing(car)} className="min-w-0 flex-1 cursor-pointer text-start">
                      <Badge tone={car.status === "bought" ? "good" : car.status === "passed" ? "neutral" : "accent"}>{t(`status_${car.status}` as TextKey)}</Badge>
                      <span className="ms-2 text-xs text-faint">{relativeDate(car.updatedAt, t.lang)}</span>
                      {car.notes && <span className="mt-1 block truncate text-xs text-muted">{car.notes}</span>}
                    </button>
                    {dropped && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-good" title={t("price_dropped")}>
                        <TrendingDown className="size-3.5" />
                        <Sparkline values={prices} className="h-5 w-12" />
                      </span>
                    )}
                    <IconButton label={car.favorite ? t("remove_favorite") : t("add_favorite")} onClick={() => updateSaved(car.id, { favorite: !car.favorite })}>
                      <Heart className={cx("size-4", car.favorite && "fill-current text-text")} />
                    </IconButton>
                    <IconButton
                      label={t("to_compare")}
                      onClick={() => compareStore.set((ids) => (ids.includes(car.id) ? ids.filter((id) => id !== car.id) : [...ids, car.id].slice(-4)))}
                      className={compare.includes(car.id) ? "bg-surface-2 text-text" : ""}
                    >
                      <Columns3 className="size-4" />
                    </IconButton>
                    <IconButton label={t("delete")} onClick={() => remove(car)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      <Modal open={editing != null} onClose={() => setEditing(null)} title={editing?.result.listing.title ?? ""}>
        {editing && <EditSaved car={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

function EditSaved({ car, onDone }: { car: SavedCar; onDone: () => void }) {
  const t = useT();
  const [status, setStatus] = useState(car.status);
  const [notes, setNotes] = useState(car.notes);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cx("cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition", status === s ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-surface hover:bg-surface-2")}
          >
            {t(`status_${s}` as TextKey)}
          </button>
        ))}
      </div>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("notes_placeholder")} />
      {car.priceHistory.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted">{t("price_history")}</div>
          <div className="space-y-1 text-sm">
            {car.priceHistory.map((entry, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-muted">{new Date(entry.at).toLocaleDateString(t.lang)}</span>
                <span className="num">{euro(entry.price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <Button
        variant="primary"
        className="w-full"
        onClick={() => {
          updateSaved(car.id, { status, notes });
          onDone();
        }}
      >
        {t("save")}
      </Button>
    </div>
  );
}
