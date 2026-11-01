import { Car, Heart, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { euro, km, pct, place, registration } from "../lib/format";
import { useT } from "../lib/i18n";
import { discountOf, photoOf, verdictOf } from "../lib/result";
import { uiStore, useStore } from "../lib/store";
import type { Purpose, Result } from "../lib/types";
import { scoreText } from "./charts";
import { Badge, Card, cx } from "./ui";

export function CarPhoto({ src, className, alt = "" }: { src: string; className?: string; alt?: string }) {
  const ui = useStore(uiStore);
  if (!src || !ui.showPhotos) {
    return (
      <div className={cx("grid place-items-center bg-gradient-to-br from-accent/15 to-accent-2/15 text-accent", className)}>
        <Car className="size-8 opacity-70" />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className={cx("object-cover", className)} />;
}

export function CarCard({ result, purpose, onClick, favorite, footer, compact }: { result: Result; purpose?: Purpose; onClick?: () => void; favorite?: boolean; footer?: ReactNode; compact?: boolean }) {
  const t = useT();
  const view = purpose ?? result.purpose;
  const verdict = verdictOf(result, view, t);
  const discount = discountOf(result);
  const { listing, valuation } = result;
  return (
    <Card className="group overflow-hidden transition hover:-translate-y-0.5 hover:border-accent/40">
      <button onClick={onClick} className="block w-full cursor-pointer text-start">
        <div className="relative">
          <CarPhoto src={photoOf(result)} className={cx("w-full", compact ? "h-32" : "h-40")} />
          {verdict && (
            <div className="absolute start-3 top-3 flex items-center gap-2">
              <Badge tone={verdict.tone} className="bg-surface/90 backdrop-blur">
                {verdict.label}
              </Badge>
            </div>
          )}
          {verdict && (
            <div className={cx("num absolute end-3 top-3 grid size-10 place-items-center rounded-full bg-surface/90 text-sm font-extrabold backdrop-blur", scoreText(verdict.score))}>{verdict.score}</div>
          )}
          {favorite && <Heart className="absolute bottom-3 end-3 size-5 fill-bad text-bad drop-shadow" />}
        </div>
        <div className="space-y-2 p-4">
          <h3 className="line-clamp-1 text-[15px] font-semibold" dir="auto">
            {listing.title}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className="num">{km(listing.km)}</span>·<span className="num">{registration(listing.month, listing.year)}</span>
            {listing.location && (
              <>
                ·<MapPin className="size-3" />
                <span className="truncate">{place(listing.location)}</span>
              </>
            )}
          </div>
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="num text-lg font-bold">{euro(listing.price)}</div>
              <div className="text-xs text-faint">
                {t("market_price")} <span className="num">{euro(valuation.market_price)}</span>
              </div>
            </div>
            {discount != null && (
              <Badge tone={discount >= 0.05 ? "good" : discount <= -0.05 ? "bad" : "neutral"}>
                <span className="num">{discount >= 0 ? "−" : "+"}{pct(Math.abs(discount))}</span>
              </Badge>
            )}
          </div>
          {view === "trade" && result.trade && result.trade.priced && (
            <div className={cx("text-sm font-semibold", result.trade.profit >= 0 ? "text-good" : "text-bad")}>
              {t("profit")} <span className="num">{euro(result.trade.profit)}</span>
            </div>
          )}
          {view === "personal" && result.personal && (
            <div className="text-sm font-semibold text-accent">
              {t("offer_max")} <span className="num">{euro(result.personal.offer_max)}</span>
            </div>
          )}
        </div>
      </button>
      {footer && <div className="border-t border-line px-4 py-2.5">{footer}</div>}
    </Card>
  );
}
