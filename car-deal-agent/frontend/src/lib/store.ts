import { useSyncExternalStore } from "react";
import type { HuntCriteria, Prefs, Result } from "./types";

// Everything a user keeps (settings, saved cars, garage, searches) lives in this browser, so
// the server holds no personal data. Export / import in the settings moves it between devices.

type Listener = () => void;

export interface Store<T> {
  get(): T;
  set(value: T | ((current: T) => T)): void;
  subscribe(listener: Listener): () => void;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof fallback === "object" && !Array.isArray(fallback) ? { ...fallback, ...parsed } : parsed;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // full (quota) or blocked storage: the app keeps working in memory
  }
}

export function createStore<T>(key: string, initial: T, onFull?: (value: T) => T): Store<T> {
  let value = read(key, initial);
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next) {
      value = typeof next === "function" ? (next as (current: T) => T)(value) : next;
      if (!write(key, value) && onFull) {
        value = onFull(value);
        write(key, value);
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

// --- what is stored ---------------------------------------------------------------------------

export const DEFAULT_PREFS: Prefs = {
  language: "ar", purpose: "trade", home_zip: "06108",
  min_profit: 500, min_roi: 0.15, min_discount: 0.12, negotiation_discount: 0.05, resale_factor: 0.95,
  fixed_costs: 0, hu_cost: 150, hu_warning_months: 2, vat_margin_scheme: false, suspicious_discount: 0.4,
  consumption: 7.5, petrol_price: 2.1, diesel_price: 2.2, lpg_price: 1.1, electricity_price: 0.35,
  round_trip: true, road_factor: 1.3,
  annual_km: 12000, usage: "mixed", max_budget: null, inspection_cost: 120,
  year_window: 2, km_window: 0.4, min_comparables: 5, comparables_pages: 2, comparables_seller: "privat",
  local_radius_km: 150,
  ai_enabled: true, ai_effort: "medium", ai_in_hunt: true,
};

export type Theme = "system" | "dark" | "light";
export type Accent = "indigo" | "emerald" | "amber" | "rose" | "sky" | "violet";
export interface UiSettings {
  theme: Theme;
  accent: Accent;
  startPage: string;
  compact: boolean;
  tips: boolean;
  autoSave: boolean;
  confirmDelete: boolean;
  showPhotos: boolean;
  onboarded: boolean;
}
export const DEFAULT_UI: UiSettings = {
  theme: "system", accent: "indigo", startPage: "dashboard", compact: false, tips: true, autoSave: true,
  confirmDelete: true, showPhotos: true, onboarded: false,
};

export type SavedStatus = "watching" | "contacted" | "viewing" | "bought" | "passed";
export interface SavedCar {
  id: string;
  result: Result;
  savedAt: string;
  updatedAt: string;
  favorite: boolean;
  status: SavedStatus;
  notes: string;
  priceHistory: { at: string; price: number | null }[];
}

export interface GarageCost {
  label: string;
  amount: number;
}
export interface GarageCar {
  id: string;
  title: string;
  url: string;
  image: string;
  boughtPrice: number;
  boughtAt: string;
  costs: GarageCost[];
  askingPrice: number | null;
  soldPrice: number | null;
  soldAt: string | null;
  notes: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  criteria: HuntCriteria;
}

const MAX_SAVED = 300;

function trimSaved(cars: SavedCar[]): SavedCar[] {
  // Storage full: drop the oldest cars that aren't favourites, and comparables of old ones.
  const sorted = [...cars].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const keep = sorted.filter((car, index) => car.favorite || index < sorted.length * 0.7);
  return keep.map((car, index) =>
    index > 50 ? { ...car, result: { ...car.result, valuation: { ...car.result.valuation, used: [] } } } : car,
  );
}

export const prefsStore = createStore<Prefs>("ah.prefs", DEFAULT_PREFS);
export const uiStore = createStore<UiSettings>("ah.ui", DEFAULT_UI);
export const savedStore = createStore<SavedCar[]>("ah.saved", [], trimSaved);
export const garageStore = createStore<GarageCar[]>("ah.garage", []);
export const searchesStore = createStore<SavedSearch[]>("ah.searches", []);
export const seenStore = createStore<string[]>("ah.seen", []);
export const compareStore = createStore<string[]>("ah.compare", []);

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Saves (or updates) an analysis; keeps favourite, status, notes and the price history. */
export function saveResult(result: Result, favorite?: boolean): SavedCar {
  const now = new Date().toISOString();
  const compact: Result = {
    ...result,
    listing: { ...result.listing, description: (result.listing.description || "").slice(0, 5000) },
    valuation: { ...result.valuation, used: (result.valuation.used || []).slice(0, 40) },
  };
  let saved!: SavedCar;
  savedStore.set((cars) => {
    const existing = cars.find((car) => car.id === result.listing.id);
    const history = existing?.priceHistory ?? [];
    const last = history[history.length - 1];
    saved = {
      id: result.listing.id,
      result: compact,
      savedAt: existing?.savedAt ?? now,
      updatedAt: now,
      favorite: favorite ?? existing?.favorite ?? false,
      status: existing?.status ?? "watching",
      notes: existing?.notes ?? "",
      priceHistory: last && last.price === result.listing.price ? history : [...history, { at: now, price: result.listing.price }],
    };
    const others = cars.filter((car) => car.id !== saved.id);
    return [saved, ...others].slice(0, MAX_SAVED);
  });
  return saved;
}

export function updateSaved(id: string, patch: Partial<SavedCar>) {
  savedStore.set((cars) => cars.map((car) => (car.id === id ? { ...car, ...patch, updatedAt: new Date().toISOString() } : car)));
}

export function markSeen(ids: string[]) {
  seenStore.set((seen) => Array.from(new Set([...ids, ...seen])).slice(0, 2000));
}

export function exportData(): string {
  return JSON.stringify(
    {
      app: "autohalle",
      version: 1,
      exportedAt: new Date().toISOString(),
      prefs: prefsStore.get(),
      ui: uiStore.get(),
      saved: savedStore.get(),
      garage: garageStore.get(),
      searches: searchesStore.get(),
    },
    null,
    1,
  );
}

export function importData(text: string): boolean {
  const data = JSON.parse(text);
  if (data?.app !== "autohalle") return false;
  if (data.prefs) prefsStore.set({ ...DEFAULT_PREFS, ...data.prefs });
  if (data.ui) uiStore.set({ ...DEFAULT_UI, ...data.ui });
  if (Array.isArray(data.saved)) savedStore.set(data.saved);
  if (Array.isArray(data.garage)) garageStore.set(data.garage);
  if (Array.isArray(data.searches)) searchesStore.set(data.searches);
  return true;
}
