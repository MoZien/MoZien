import { Car, Heart } from "lucide-react";
import type { ReactNode } from "react";
import { euro, km, pct, place, registration } from "../lib/format";
import { useT } from "../lib/i18n";
import { discountOf, photoOf, verdictOf } from "../lib/result";
import { uiStore, useStore } from "../lib/store";
import type { Purpose, Result } from "../lib/types";
import { type Tone, cx } from "./ui";

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

/** A car as one compact row: a small photo, title and price, one line of facts, the verdict and how
 *  far the price is from the market. `meta` adds a line below (status, date) with `actions` (small
 *  buttons) at its end, `note` one more line. */
export function CarListRow({
  result,
  purpose,
  onClick,
  favorite,
  meta,
  actions,
  note,
}: {
  result: Result;
  purpose?: Purpose;
  onClick?: () => void;
  favorite?: boolean;
  meta?: ReactNode;
  actions?: ReactNode;
  note?: ReactNode;
}) {
  const t = useT();
  const view = purpose ?? result.purpose;
  const verdict = verdictOf(result, view, t, true);
  const discount = discountOf(result);
  const { listing } = result;
  const discountTone = discount == null ? "text-muted" : discount >= 0.05 ? "text-good" : discount <= -0.05 ? "text-bad" : "text-muted";
  return (
    <div className="flex gap-3 bg-surface px-3.5 py-3 transition hover:bg-surface-2/50 sm:px-4">
      <button type="button" onClick={onClick} tabIndex={-1} aria-hidden="true" className="relative h-[60px] w-20 shrink-0 cursor-pointer">
        <CarPhoto src={photoOf(result)} className="size-full rounded-[8px]" />
        {favorite && (
          <span className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full bg-surface shadow-sm ring-1 ring-line">
            <Heart className="size-3 fill-current text-text" />
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onClick} className="block w-full cursor-pointer text-start">
          <span className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium rtl:text-right" dir="auto">
              {listing.title}
            </span>
            <span className="num shrink-0 text-[15px] font-semibold">{euro(listing.price)}</span>
          </span>
          <span className="mt-0.5 block">
            <Facts result={result} />
          </span>
          {(verdict || discount != null) && (
            <span className="mt-1 flex min-w-0 items-center gap-2">
              {verdict && <VerdictLabel tone={verdict.tone} label={verdict.label} className="shrink-0" />}
              {verdict && discount != null && <span className="text-faint">·</span>}
              {discount != null && (
                <span className={cx("truncate text-[13px]", discountTone)}>
                  <span className="num">{pct(Math.abs(discount))}</span> {discount >= 0 ? t("below_market") : t("above_market")}
                </span>
              )}
            </span>
          )}
        </button>
        {(meta || actions) && (
          <div className="mt-1.5 flex min-h-8 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">{meta}</div>
            {actions && <div className="-me-1.5 flex shrink-0 items-center">{actions}</div>}
          </div>
        )}
        {note}
      </div>
    </div>
  );
}
