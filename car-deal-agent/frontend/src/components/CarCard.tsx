import { Car, Heart } from "lucide-react";
import type { ReactNode } from "react";
import { euro, km, pct, place, registration } from "../lib/format";
import { useT } from "../lib/i18n";
import { discountOf, photoOf, verdictOf } from "../lib/result";
import { uiStore, useStore } from "../lib/store";
import type { Purpose, Result } from "../lib/types";
import { Card, type Tone, cx } from "./ui";

export const toneText: Record<Tone, string> = { good: "text-good", warn: "text-warn", bad: "text-bad", neutral: "text-muted", accent: "text-accent" };
/** A small dot in the verdict colour, before the verdict's name. */
export const toneDot: Record<Tone, string> = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", neutral: "bg-faint", accent: "bg-accent" };

export function CarPhoto({ src, className, alt = "" }: { src: string; className?: string; alt?: string }) {
  const ui = useStore(uiStore);
  if (!src || !ui.showPhotos) {
    return (
      <div className={cx("grid place-items-center bg-surface-2 text-faint", className)}>
        <Car className="size-7" strokeWidth={1.25} />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className={cx("object-cover", className)} />;
}

/** One line of facts: 191.243 km · 04/2011 · Eltmann */
function Facts({ result }: { result: Result }) {
  const { listing } = result;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
      <span className="num shrink-0">{km(listing.km)}</span>
      <span className="text-faint">·</span>
      <span className="num shrink-0">{registration(listing.month, listing.year)}</span>
      {listing.location && (
        <>
          <span className="text-faint">·</span>
          <span className="truncate">{place(listing.location)}</span>
        </>
      )}
    </div>
  );
}

/** The verdict as coloured text with a dot. */
export function VerdictLabel({ tone, label, className }: { tone: Tone; label: string; className?: string }) {
  return (
    <span className={cx("flex items-center gap-1.5 text-[13px] font-semibold", toneText[tone], className)}>
      <span className={cx("size-1.5 shrink-0 rounded-full", toneDot[tone])} />
      {label}
    </span>
  );
}

export function CarCard({ result, purpose, onClick, favorite, footer, compact }: { result: Result; purpose?: Purpose; onClick?: () => void; favorite?: boolean; footer?: ReactNode; compact?: boolean }) {
  const t = useT();
  const view = purpose ?? result.purpose;
  const verdict = verdictOf(result, view, t, true);
  const discount = discountOf(result);
  const { listing, valuation } = result;
  const discountTone = discount == null ? "text-muted" : discount >= 0.05 ? "text-good" : discount <= -0.05 ? "text-bad" : "text-muted";
  return (
    <Card className="overflow-hidden transition hover:shadow-card">
      <button onClick={onClick} className="block w-full cursor-pointer text-start">
        <div className="relative">
          <CarPhoto src={photoOf(result)} className={cx("w-full", compact ? "h-36" : "h-44")} />
          {favorite && (
            <span className="absolute end-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-black/45 backdrop-blur-sm">
              <Heart className="size-4 fill-white text-white" />
            </span>
          )}
        </div>
        <div className="p-4">
          {verdict && <VerdictLabel tone={verdict.tone} label={verdict.label} className="mb-1.5" />}
          <h3 className="truncate text-[15px] font-semibold rtl:text-right" dir="auto">
            {listing.title}
          </h3>
          <Facts result={result} />
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <span className="num text-[19px] font-semibold">{euro(listing.price)}</span>
            {discount != null && (
              <span className={cx("text-[13px] font-medium", discountTone)}>
                <span className="num">{pct(Math.abs(discount))}</span> {discount >= 0 ? t("below_market") : t("above_market")}
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[13px]">
            <div className="min-w-0">
              <div className="text-faint">{t("market_price")}</div>
              <div className="num font-medium">{euro(valuation.market_price)}</div>
            </div>
            {view === "trade" && result.trade?.priced ? (
              <div className="min-w-0">
                <div className="text-faint">{t("profit")}</div>
                <div className={cx("num font-medium", result.trade.profit >= 0 ? "text-good" : "text-bad")}>{euro(result.trade.profit)}</div>
              </div>
            ) : view === "personal" && result.personal ? (
              <div className="min-w-0">
                <div className="text-faint">{t("offer_max")}</div>
                <div className="num font-medium">{euro(result.personal.offer_max)}</div>
              </div>
            ) : null}
          </div>
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
    <button onClick={onClick} className="flex w-full cursor-pointer items-center gap-3.5 py-3 text-start">
      <CarPhoto src={photoOf(result)} className="h-14 w-[76px] shrink-0 rounded-[8px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium rtl:text-right" dir="auto">
            {result.listing.title}
          </span>
          {favorite && <Heart className="size-3.5 shrink-0 fill-current text-muted" />}
        </div>
        <Facts result={result} />
        <div className="mt-1 flex items-center gap-3 text-sm">
          <span className="num font-semibold">{euro(result.listing.price)}</span>
          {verdict && <VerdictLabel tone={verdict.tone} label={verdict.label} />}
        </div>
      </div>
    </button>
  );
}
