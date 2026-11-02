import { Car, Heart } from "lucide-react";
import type { ReactNode } from "react";
import { euro, km, pct, place, registration } from "../lib/format";
import { useT } from "../lib/i18n";
import { discountOf, photoOf, verdictOf } from "../lib/result";
import { uiStore, useStore } from "../lib/store";
import type { Purpose, Result } from "../lib/types";
import { Card, type Tone, cx } from "./ui";

export const toneText: Record<Tone, string> = { good: "text-good", warn: "text-warn", bad: "text-bad", neutral: "text-muted", accent: "text-text" };

export function CarPhoto({ src, className, alt = "" }: { src: string; className?: string; alt?: string }) {
  const ui = useStore(uiStore);
  if (!src || !ui.showPhotos) {
    return (
      <div className={cx("grid place-items-center bg-surface-2 text-faint", className)}>
        <Car className="size-7" strokeWidth={1.5} />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className={cx("object-cover", className)} />;
}

/** One line of facts: 191.243 km · 04/2011 · Eltmann */
function Facts({ result }: { result: Result }) {
  const { listing } = result;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
      <span className="num shrink-0">{km(listing.km)}</span>
      <span>·</span>
      <span className="num shrink-0">{registration(listing.month, listing.year)}</span>
      {listing.location && (
        <>
          <span>·</span>
          <span className="truncate">{place(listing.location)}</span>
        </>
      )}
    </div>
  );
}

export function CarCard({ result, purpose, onClick, favorite, footer, compact }: { result: Result; purpose?: Purpose; onClick?: () => void; favorite?: boolean; footer?: ReactNode; compact?: boolean }) {
  const t = useT();
  const view = purpose ?? result.purpose;
  const verdict = verdictOf(result, view, t, true);
  const discount = discountOf(result);
  const { listing, valuation } = result;
  return (
    <Card className="overflow-hidden transition hover:border-muted/40">
      <button onClick={onClick} className="block w-full cursor-pointer text-start">
        <div className="relative">
          <CarPhoto src={photoOf(result)} className={cx("w-full", compact ? "h-32" : "h-40")} />
          {favorite && <Heart className="absolute end-3 top-3 size-5 fill-white text-white drop-shadow" />}
        </div>
        <div className="space-y-1.5 p-4">
          <h3 className="truncate text-[15px] font-semibold rtl:text-right" dir="auto">
            {listing.title}
          </h3>
          <Facts result={result} />
          <div className="flex items-baseline justify-between gap-2 pt-1">
            <span className="num text-lg font-semibold">{euro(listing.price)}</span>
            {verdict && <span className={cx("text-sm font-semibold", toneText[verdict.tone])}>{verdict.label}</span>}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span>
              {t("market_price")} <span className="num">{euro(valuation.market_price)}</span>
            </span>
            {discount != null && <span className="num">{discount >= 0 ? "−" : "+"}{pct(Math.abs(discount))}</span>}
          </div>
          {view === "trade" && result.trade?.priced && (
            <div className={cx("text-sm", result.trade.profit >= 0 ? "text-good" : "text-bad")}>
              {t("profit")} <span className="num font-semibold">{euro(result.trade.profit)}</span>
            </div>
          )}
          {view === "personal" && result.personal && (
            <div className="text-sm text-muted">
              {t("offer_max")} <span className="num font-semibold text-text">{euro(result.personal.offer_max)}</span>
            </div>
          )}
        </div>
      </button>
      {footer && <div className="border-t border-line px-4 py-2.5">{footer}</div>}
    </Card>
  );
}

/** A car as one list row: photo, title, facts, price and verdict. */
export function CarRow({ result, onClick, favorite }: { result: Result; onClick?: () => void; favorite?: boolean }) {
  const t = useT();
  const verdict = verdictOf(result, result.purpose, t, true);
  return (
    <button onClick={onClick} className="flex w-full cursor-pointer items-center gap-3 py-3 text-start">
      <CarPhoto src={photoOf(result)} className="size-16 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium rtl:text-right" dir="auto">
            {result.listing.title}
          </span>
          {favorite && <Heart className="size-3.5 shrink-0 fill-current text-muted" />}
        </div>
        <Facts result={result} />
        <div className="mt-1 flex items-center gap-2 text-sm">
          <span className="num font-semibold">{euro(result.listing.price)}</span>
          {verdict && <span className={cx("font-medium", toneText[verdict.tone])}>{verdict.label}</span>}
        </div>
      </div>
    </button>
  );
}
