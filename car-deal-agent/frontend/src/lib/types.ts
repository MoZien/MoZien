// Shapes of the API (src/cardeal/web) as the frontend uses them.

export type Purpose = "personal" | "trade";
export type Lang = "ar" | "de" | "en";

export interface Prefs {
  language: Lang;
  purpose: Purpose;
  home_zip: string;
  min_profit: number;
  min_roi: number;
  min_discount: number;
  negotiation_discount: number;
  resale_factor: number;
  fixed_costs: number;
  hu_cost: number;
  hu_warning_months: number;
  vat_margin_scheme: boolean;
  suspicious_discount: number;
  consumption: number;
  petrol_price: number;
  diesel_price: number;
  lpg_price: number;
  electricity_price: number;
  round_trip: boolean;
  road_factor: number;
  annual_km: number;
  usage: "city" | "mixed" | "highway";
  max_budget: number | null;
  inspection_cost: number;
  year_window: number;
  km_window: number;
  min_comparables: number;
  comparables_pages: number;
  comparables_seller: "privat" | "gewerblich" | "all";
  local_radius_km: number;
  ai_enabled: boolean;
  ai_effort: "low" | "medium" | "high";
  ai_in_hunt: boolean;
}

export interface HuntCriteria {
  max_price: number | null;
  min_price: number | null;
  min_year: number | null;
  max_year: number | null;
  min_km: number | null;
  max_km: number | null;
  zip_code: string | null;
  radius_km: number | null;
  seller: "privat" | "gewerblich" | "all";
  make: string | null;
  query: string;
  fuel: string | null;
  gearbox: "manuell" | "automatik" | null;
  body_type: string | null;
  exclude_places: string[];
  count: number;
  max_ads: number;
  pages: number;
  skip_ids?: string[];
}

export interface ManualCar {
  make: string;
  model: string;
  year: number;
  month: number | null;
  km: number;
  power_ps: number | null;
  fuel: string | null;
  gearbox: "manuell" | "automatik" | null;
  body_type: string | null;
  price: number | null;
  negotiable: boolean;
  zip_code: string | null;
  hu_until: string | null;
}

export interface Listing {
  id: string;
  source: string;
  url: string;
  title: string;
  price: number | null;
  negotiable: boolean;
  km: number | null;
  year: number | null;
  month: number | null;
  location: string;
  description: string;
  make: string | null;
  model: string | null;
  fuel: string | null;
  gearbox: string | null;
  power_ps: number | null;
  condition: string | null;
  hu_until: string | null;
  seller_type: string | null;
  features: string[];
  body_type: string | null;
  images: string[];
  flags: string[];
  distance_km: number | null;
  damaged: boolean;
  [key: string]: unknown;
}

export interface Comparable {
  url: string;
  title: string;
  price: number;
  adjusted: number;
  km: number;
  year: number;
  month: number | null;
  location: string;
}

export interface Valuation {
  market_price: number | null;
  comparables: number;
  spread: number | null;
  confidence: "high" | "medium" | "low" | "none";
  method: string;
  basis: string;
  comparables_url: string;
  year_effect: number | null;
  km_effect: number | null;
  used: Comparable[];
  power_as_kw: boolean;
  local_factor: number | null;
  local_ads: number;
  range: [number, number] | null;
  median?: number;
}

export interface Trade {
  buy_price: number;
  resale_price: number;
  repair_costs: number;
  other_costs: number;
  vat: number;
  profit: number;
  roi: number;
  hu_cost: number;
  max_buy_price: number;
  target_profit: number;
  fuel_cost: number;
  trip_km: number;
  trip_legs: number;
  priced: boolean;
  fuel_price: number;
  consumption: number;
  resale_factor: number;
  total_costs: number;
  verdict: "deal" | "check" | "low_profit" | "skip";
  reasons: string[];
  score: number;
}

export interface Personal {
  priced: boolean;
  asking: number | null;
  market: number;
  discount: number | null;
  rating: "steal" | "good" | "fair" | "high" | "overpriced" | "unknown";
  offer_start: number;
  offer_max: number;
  consumption: number;
  energy_unit: string;
  energy_price: number;
  fuel_per_year: number;
  hu_cost: number;
  repairs: number;
  inspection_cost: number;
  trip_cost: number;
  first_year_cost: number;
  score: number;
  verdict: "buy" | "negotiate" | "check" | "avoid";
  reasons: string[];
}

export interface Issue {
  issue: string;
  basis: "stated" | "hinted" | "unknown";
  quote: string;
  cost_eur: number;
}

export interface Analysis {
  verdict: string;
  verdict_reason: string;
  issues: Issue[];
  positives: string[];
  scam_risk: "low" | "medium" | "high";
  scam_signals: string[];
  questions_for_seller: string[];
  negotiation_tip: string;
  seller_message: string;
  // trade review
  resale_difficulty?: "easy" | "normal" | "hard";
  // personal review
  reliability?: number;
  known_weak_points?: { item: string; typical_cost_eur: number; how_to_check: string }[];
  negatives?: string[];
  inspection_checklist?: string[];
  suitability?: string;
  yearly_upkeep_eur?: number;
}

export interface Result {
  purpose: Purpose;
  listing: Listing;
  valuation: Valuation;
  trade: Trade | null;
  personal: Personal | null;
  analysis: Analysis | null;
  analysis_kind: Purpose | null;
  ai_status: "ok" | "off" | "unavailable" | "failed" | "quota" | "skipped";
  ai_error?: string | null;
  costed_issues: Issue[];
  created_at: string;
}

export interface JobStep {
  key: string;
  state: "pending" | "active" | "done" | "failed" | "skipped";
  [key: string]: unknown;
}

export interface Job<T = unknown> {
  id: string;
  kind: string;
  status: "queued" | "running" | "done" | "error" | "cancelled";
  steps: JobStep[];
  progress: Record<string, number>;
  partial: Record<string, any>;
  result: T | null;
  error: { code: string; [key: string]: unknown } | null;
  queue_position: number | null;
}

export interface HuntResult {
  found: Result[];
  checked: number;
  ads: number;
  candidates: number;
  stopped: string | null;
}

export interface Meta {
  app_name: string;
  version: string;
  ai_available: boolean;
  ai_model: string;
  auth_required: boolean;
  login?: ("email" | "code")[];
  account: { id?: string; name: string; email?: string; admin: boolean; usage: Record<string, { used: number; limit: number }> } | null;
  makes: Record<string, string>;
  fuels: Record<string, string>;
  bodies: Record<string, string>;
  gearboxes: Record<string, string>;
  defaults: Prefs;
  hunt_defaults: HuntCriteria;
}

export interface TextScan {
  summary: string;
  issues: Issue[];
  red_flags: string[];
  scam_risk: "low" | "medium" | "high";
  scam_signals: string[];
  questions_for_seller: string[];
}
