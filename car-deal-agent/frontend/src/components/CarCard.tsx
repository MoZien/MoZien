import { CarFront, Heart } from "lucide-react";
import { type ReactNode, useState } from "react";
import { euro, km, pct, place, registration } from "../lib/format";
import { useT } from "../lib/i18n";
import { discountOf, photoOf, verdictOf } from "../lib/result";
import { uiStore, useStore } from "../lib/store";
import type { Purpose, Result } from "../lib/types";
import { MiniScore } from "./charts";
import { type Tone, cx } from "./ui";

export const toneText: Record<Tone, string> = { good: "text-good", warn: "text-warn", bad: "text-bad", neutral: "text-muted", accent: "text-accent" };
/** A small dot in the verdict colour, before the verdict's name. */
export const toneDot: Record<Tone, string> = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", neutral: "bg-faint", accent: "bg-accent" };
const tonePill: Record<Tone, string> = {
  good: "bg-good/12 text-good",
  warn: "bg-warn/14 text-warn",
  bad: "bg-bad/12 text-bad",
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent/12 text-accent",
};

/** A photo of a car; it fades in once loaded. Without a photo (or with photos turned off in the
 *  settings) a quiet placeholder. `className` sizes and rounds the frame. */
export function CarPhoto({ src, className, alt = "" }: { src: string; className?: string; alt?: string }) {
  const ui = useStore(uiStore);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  if (!src || !ui.showPhotos || state === "failed") {
    return (
      <span className={cx("grid place-items-center bg-gradient-to-br from-surface-2 to-surface-3 text-faint", className)}>
        <CarFront className="size-[34%] max-h-9 min-h-5" strokeWidth={1.25} />
      </span>
    );
  }
  return (
    <span className={cx("relative block overflow-hidden", state === "loading" && "shimmer", className)}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setState("ok")}
        onError={() => setState("failed")}
        className={cx("absolute inset-0 size-full object-cover transition-opacity duration-500", state === "ok" ? "opacity-100" : "opacity-0")}
      />
    </span>
  );
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

/** The verdict as a small filled pill (on cards and photos). */
export function VerdictPill({ tone, label, className, solid }: { tone: Tone; label: string; className?: string; solid?: boolean }) {
  return (
    <span className={cx("inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", solid ? "bg-[#0b1324]/70 text-white backdrop-blur-md" : tonePill[tone], className)}>
      <span className={cx("size-1.5 shrink-0 rounded-full", toneDot[tone])} />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** How far the price is from the market: "12 % unter Markt", green below, red above. */
function Discount({ value, short }: { value: number; short?: boolean }) {
  const t = useT();
  const tone = value >= 0.05 ? "text-good" : value <= -0.05 ? "text-bad" : "text-muted";
  return (
    <span className={cx("truncate text-[13px] font-medium", tone)}>
      <span className="num">
        {short && (value >= 0 ? "−" : "+")}
        {pct(Math.abs(value))}
      </span>
      {!short && <> {value >= 0 ? t("below_market") : t("above_market")}</>}
    </span>
  );
}

/** A car as one row in a card of its own: photo, title and score, one line of facts, the price,
 *  how far it is from the market and the verdict. `meta` adds a line below (status, date) with
 *  `actions` (small buttons) at its end, `note` one more line. */
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
  return (
    <div className="group min-w-0 rounded-card border border-line bg-surface p-3 shadow-card transition duration-300 hover:border-line-strong hover:shadow-pop">
      <div className="flex gap-3.5">
        <button type="button" onClick={onClick} tabIndex={-1} aria-hidden="true" className="relative h-[88px] w-[108px] shrink-0 cursor-pointer overflow-hidden rounded-2xl sm:h-[96px] sm:w-[132px]">
          <CarPhoto src={photoOf(result)} className="size-full transition-transform duration-500 group-hover:scale-105" />
          {favorite && (
            <span className="absolute start-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur">
              <Heart className="size-3.5 fill-[#e5484d] text-[#e5484d]" />
            </span>
          )}
        </button>
        <button type="button" onClick={onClick} className="block min-w-0 flex-1 cursor-pointer py-0.5 text-start">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold rtl:text-right" dir="auto">
                {listing.title}
              </span>
              <span className="mt-0.5 block">
                <Facts result={result} />
              </span>
            </span>
            {verdict && <MiniScore score={verdict.score} tone={verdict.tone} size={38} />}
          </span>
          <span className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="num text-[17px] font-bold leading-none tracking-tight">{euro(listing.price)}</span>
            {discount != null && <Discount value={discount} />}
          </span>
          {verdict && (
            <span className="mt-2 block">
              <VerdictPill tone={verdict.tone} label={verdict.label} />
            </span>
          )}
        </button>
      </div>
      {(meta || actions) && (
        <div className="mt-2.5 flex min-h-9 items-center gap-2 border-t border-line pt-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">{meta}</div>
          {actions && <div className="-me-1 flex shrink-0 items-center">{actions}</div>}
        </div>
      )}
      {note}
    </div>
  );
}

/** A car as an upright card (the row of recent checks): the photo with the verdict on it, then
 *  title, facts and price. */
export function CarTile({ result, favorite, onClick, className }: { result: Result; favorite?: boolean; onClick?: () => void; className?: string }) {
  const t = useT();
  const verdict = verdictOf(result, result.purpose, t, true);
  const discount = discountOf(result);
  const { listing } = result;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("group flex cursor-pointer flex-col overflow-hidden rounded-card border border-line bg-surface text-start shadow-card transition duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-pop active:scale-[0.98]", className)}
    >
      <span className="relative block aspect-[16/10] w-full overflow-hidden">
        <CarPhoto src={photoOf(result)} className="size-full transition-transform duration-500 group-hover:scale-105" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
        {verdict && <VerdictPill solid tone={verdict.tone} label={verdict.label} className="absolute bottom-2 start-2 max-w-[calc(100%-1rem)]" />}
        {favorite && (
          <span className="absolute end-2 top-2 grid size-7 place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur">
            <Heart className="size-4 fill-[#e5484d] text-[#e5484d]" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 p-3.5">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold rtl:text-right" dir="auto">
            {listing.title}
          </span>
          {verdict && <MiniScore score={verdict.score} tone={verdict.tone} size={34} />}
        </span>
        <Facts result={result} />
        <span className="mt-1.5 flex items-baseline gap-2">
          <span className="num text-[18px] font-bold leading-none tracking-tight">{euro(listing.price)}</span>
          {discount != null && <Discount value={discount} short />}
        </span>
      </span>
    </button>
  );
}
