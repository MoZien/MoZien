import { Columns3, Flame, Heart, History, Search, SlidersHorizontal, Trash2, TrendingDown, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { CarListRow } from "../components/CarCard";
import { Sparkline } from "../components/charts";
import { EASE } from "../components/motion";
import { Badge, Button, Card, EmptyState, Field, IconButton, Modal, PageTitle, Select, Tabs, Textarea, Toggle, cx } from "../components/ui";
import { useApp } from "../lib/app";
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
  const { meta } = useApp();
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
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const activeFilters = Number(sort !== "date") + Number(purpose !== "all") + Number(status !== "all") + Number(onlyGood);
  const chip = "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-accent/25 bg-accent/8 px-3 py-1.5 text-[13px] font-semibold text-accent transition active:scale-95";

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageTitle
        icon={<Heart className="size-6" />}
        hue="bad"
        title={t("nav_saved")}
        sub={t("saved_sub")}
        action={
          compare.length > 0 && (
            <Button size="sm" variant="primary" icon={<Columns3 className="size-4" />} onClick={() => navigate("compare")}>
              {t("nav_compare")} <span className="num rounded-full bg-white/20 px-1.5 text-xs font-bold">{compare.length}</span>
            </Button>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "favorites", label: t("favorites"), icon: <Heart className="size-4" />, badge: <span className="num rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold text-muted">{saved.filter((c) => c.favorite).length}</span> },
          { value: "history", label: t("history"), icon: <History className="size-4" />, badge: <span className="num rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold text-muted">{saved.length}</span> },
        ]}
      />
      {/* Search, and sort and filter in a sheet; what is set shows as chips that remove it. */}
      <div className="space-y-2.5">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search_saved")}
              className="h-12 w-full rounded-field border border-line-strong bg-surface ps-10 pe-3 text-sm outline-none transition placeholder:text-faint hover:border-faint focus:border-accent focus:ring-4 focus:ring-accent/15"
            />
          </div>
          <Button className="h-12!" onClick={() => setFiltersOpen(true)} icon={<SlidersHorizontal className="size-4" />} aria-label={t("sort_filter")}>
            <span className="hidden sm:inline">{t("sort_filter")}</span>
            {activeFilters > 0 && <span className="num bg-brand grid size-5 place-items-center rounded-full text-[11px] font-bold text-white">{activeFilters}</span>}
          </Button>
        </div>
        {activeFilters > 0 && (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {onlyGood && (
              <button onClick={() => setOnlyGood(false)} className={chip}>
                <Flame className="size-3.5" /> {t("only_good")} <X className="size-3.5" aria-label={t("remove_filter")} />
              </button>
            )}
            {sort !== "date" && (
              <button onClick={() => setSort("date")} className={chip}>
                <TrendingDown className="size-3.5" /> {t(`sort_${sort}` as TextKey)} <X className="size-3.5" aria-label={t("remove_filter")} />
              </button>
            )}
            {purpose !== "all" && (
              <button onClick={() => setPurpose("all")} className={chip}>
                {t(purpose === "trade" ? "purpose_trade_short" : "purpose_personal_short")} <X className="size-3.5" aria-label={t("remove_filter")} />
              </button>
            )}
            {status !== "all" && (
              <button onClick={() => setStatus("all")} className={chip}>
                {t(`status_${status}` as TextKey)} <X className="size-3.5" aria-label={t("remove_filter")} />
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
                meta?.hunt === false ? (
                  <Button onClick={() => navigate("analyze")}>{t("nav_analyze")}</Button>
                ) : (
                  <Button onClick={() => navigate("hunt")}>{t("qa_hunt")}</Button>
                )
              ) : (
                <Button onClick={() => navigate("analyze")}>{t("nav_analyze")}</Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <AnimatePresence mode="popLayout">
          {list.map((car, index) => {
            const prices = car.priceHistory.map((p) => p.price).filter((p): p is number => p != null);
            const dropped = prices.length > 1 && prices[prices.length - 1] < prices[0];
            return (
              <motion.div key={car.id} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.32, ease: EASE, delay: Math.min(index, 8) * 0.035 }}>
              <CarListRow
                result={car.result}
                favorite={car.favorite}
                onClick={() => navigate("analyze", car.id)}
                meta={
                  <>
                    <button onClick={() => setEditing(car)} className="min-w-0 max-w-[60%] shrink-0 cursor-pointer" aria-label={t("edit")}>
                      <Badge tone={car.status === "bought" ? "good" : car.status === "passed" ? "neutral" : "accent"} className="max-w-full">
                        <span className="min-w-0 truncate">{t(`status_${car.status}` as TextKey)}</span>
                      </Badge>
                    </button>
                    <span className="min-w-0 truncate text-xs text-faint">{relativeDate(car.updatedAt, t.lang)}</span>
                    {dropped && (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-good" title={t("price_dropped")}>
                        <TrendingDown className="size-3.5" />
                        <Sparkline values={prices} className="h-4 w-10" />
                      </span>
                    )}
                  </>
                }
                actions={
                  <>
                    <IconButton label={car.favorite ? t("remove_favorite") : t("add_favorite")} onClick={() => updateSaved(car.id, { favorite: !car.favorite })} className="size-8">
                      <Heart key={String(car.favorite)} className={cx("size-4", car.favorite && "animate-pop fill-[#e5484d] text-[#e5484d]")} />
                    </IconButton>
                    <IconButton
                      label={t("to_compare")}
                      onClick={() => compareStore.set((ids) => (ids.includes(car.id) ? ids.filter((id) => id !== car.id) : [...ids, car.id].slice(-4)))}
                      className={cx("size-8", compare.includes(car.id) && "bg-accent/12 text-accent")}
                    >
                      <Columns3 className="size-4" />
                    </IconButton>
                    <IconButton label={t("delete")} onClick={() => remove(car)} className="size-8">
                      <Trash2 className="size-4" />
                    </IconButton>
                  </>
                }
                note={
                  car.notes ? (
                    <button onClick={() => setEditing(car)} className="mt-1.5 block w-full cursor-pointer truncate rounded-lg bg-surface-2 px-2.5 py-1.5 text-start text-xs text-muted">
                      {car.notes}
                    </button>
                  ) : null
                }
              />
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      )}

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t("sort_filter")}
        footer={
          <Button variant="primary" className="w-full" onClick={() => setFiltersOpen(false)}>
            {t("done")}
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label={t("sort")}>
            <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="date">{t("sort_date")}</option>
              <option value="score">{t("sort_score")}</option>
              <option value="discount">{t("sort_discount")}</option>
              <option value="price">{t("sort_price")}</option>
            </Select>
          </Field>
          <Field label={t("purpose")}>
            <Select value={purpose} onChange={(e) => setPurpose(e.target.value as typeof purpose)}>
              <option value="all">{t("all")}</option>
              <option value="personal">{t("purpose_personal_short")}</option>
              <option value="trade">{t("purpose_trade_short")}</option>
            </Select>
          </Field>
          <Field label={t("status")}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">{t("all")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status_${s}` as TextKey)}
                </option>
              ))}
            </Select>
          </Field>
          <Toggle checked={onlyGood} onChange={setOnlyGood} label={t("only_good")} />
        </div>
      </Modal>

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
            className={cx("cursor-pointer rounded-full border px-3.5 py-2 text-sm font-medium transition active:scale-95", status === s ? "bg-brand border-transparent text-white shadow-glow" : "border-line-strong bg-surface hover:bg-surface-2")}
          >
            {t(`status_${s}` as TextKey)}
          </button>
        ))}
      </div>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("notes_placeholder")} />
      {car.priceHistory.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted">{t("price_history")}</div>
          <div className="space-y-1 rounded-2xl bg-surface-2 p-3 text-sm ring-1 ring-line">
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
