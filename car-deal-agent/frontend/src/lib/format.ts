// Numbers in the German format the ads use ("9.200 €", "150.000 km"), whatever the UI language.

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

export const euro = (value: number | null | undefined) => (value == null || Number.isNaN(value) ? "–" : eur.format(value));
export const number = (value: number | null | undefined) => (value == null ? "–" : num.format(value));
export const decimal = (value: number | null | undefined) => (value == null ? "–" : dec.format(value));
export const km = (value: number | null | undefined) => (value == null ? "–" : `${num.format(value)} km`);
export const pct = (value: number | null | undefined, digits = 0) =>
  value == null ? "–" : `${(value * 100).toFixed(digits).replace(".", ",")} %`;
export const signedPct = (value: number | null | undefined) =>
  value == null ? "–" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value * 100).toFixed(0)} %`;
export const registration = (month: number | null | undefined, year: number | null | undefined) =>
  year ? (month ? `${String(month).padStart(2, "0")}/${year}` : String(year)) : "–";

export function place(location: string | null | undefined): string {
  return (location || "").replace(/^\s*\d{5}\s*/, "").replace(/^[^-]+ - /, "") || "–";
}

export function relativeDate(iso: string, lang: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(seconds, "second");
}

/** Months from today until a HU (TÜV) date "MM/YYYY"; negative when overdue. */
export function monthsUntil(hu: string | null | undefined): number | null {
  const match = /^(\d{1,2})\/(\d{4})$/.exec(hu || "");
  if (!match) return null;
  const now = new Date();
  return (Number(match[2]) - now.getFullYear()) * 12 + Number(match[1]) - (now.getMonth() + 1);
}

export function clamp(value: number, low: number, high: number) {
  return Math.min(Math.max(value, low), high);
}
