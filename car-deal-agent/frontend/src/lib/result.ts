import type { Tone } from "../components/ui";
import { euro, km, pct, registration } from "./format";
import type { T, TextKey } from "./i18n";
import type { Purpose, Result } from "./types";

export interface Verdict {
  key: string;
  label: string;
  tone: Tone;
  score: number;
  reasons: string[];
}

const TONES: Record<string, Tone> = {
  deal: "good", buy: "good", check: "warn", negotiate: "warn", skip: "bad", avoid: "bad",
};

/** Verdict, score and reasons of a result for one purpose (the numbers exist for both). */
export function verdictOf(result: Result, purpose: Purpose, t: T): Verdict | null {
  const part = purpose === "trade" ? result.trade : result.personal;
  if (!part) return null;
  return { key: part.verdict, label: t(`verdict_${part.verdict}` as TextKey), tone: TONES[part.verdict] ?? "neutral", score: part.score, reasons: part.reasons };
}

export function discountOf(result: Result): number | null {
  const market = result.valuation.market_price;
  const price = result.listing.price;
  if (!market || price == null || !(result.trade?.priced ?? true)) return null;
  return (market - price) / market;
}

export function isGood(result: Result, purpose: Purpose): boolean {
  const verdict = purpose === "trade" ? result.trade?.verdict : result.personal?.verdict;
  return verdict === "deal" || verdict === "buy";
}

export function shareText(result: Result, purpose: Purpose, t: T): string {
  const { listing, valuation } = result;
  const verdict = verdictOf(result, purpose, t);
  const lines = [
    `${listing.title}`,
    `${euro(listing.price)}${listing.negotiable ? " VB" : ""} · ${km(listing.km)} · EZ ${registration(listing.month, listing.year)}`,
    `${t("market_price")}: ${euro(valuation.market_price)} (${valuation.comparables} ${t("comparables")})`,
  ];
  const discount = discountOf(result);
  if (discount != null) lines.push(`${discount >= 0 ? t("below_market") : t("above_market")}: ${pct(Math.abs(discount))}`);
  if (verdict) lines.push(`${verdict.label} · ${t("score")} ${verdict.score}/100`);
  if (purpose === "trade" && result.trade) lines.push(`${t("profit")}: ${euro(result.trade.profit)}`);
  if (purpose === "personal" && result.personal) lines.push(`${t("offer_max")}: ${euro(result.personal.offer_max)}`);
  if (listing.url) lines.push(listing.url);
  return lines.join("\n");
}

export const photoOf = (result: Result) => result.listing.images?.[0] ?? "";
