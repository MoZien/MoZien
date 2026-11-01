import { useId, useMemo, useState } from "react";
import { euro, km as fmtKm, number } from "../lib/format";
import { cx, Num } from "./ui";

export function scoreTone(score: number) {
  return score >= 70 ? "good" : score >= 45 ? "warn" : "bad";
}

/** Text color class for a score (full class names, so Tailwind sees them). */
export function scoreText(score: number) {
  return { good: "text-good", warn: "text-warn", bad: "text-bad" }[scoreTone(score)];
}

const toneColor = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)" } as const;

/** A 0-100 ring with the score in the middle. */
export function ScoreRing({ score, size = 112, label }: { score: number; size?: number; label?: string }) {
  const stroke = size * 0.09;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = toneColor[scoreTone(score)];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="num text-[1.9em] font-extrabold leading-none" style={{ color, fontSize: size * 0.3 }}>
            {score}
          </div>
          {label && <div className="mt-1 text-[11px] font-medium text-muted">{label}</div>}
        </div>
      </div>
    </div>
  );
}

/** Where the asking price sits against the typical range of comparable prices. */
export function PriceRange({ low, high, market, price, labels }: { low: number; high: number; market: number; price: number | null; labels: { market: string; price: string } }) {
  const values = [low, high, market, ...(price ? [price] : [])];
  const min = Math.min(...values) * 0.9;
  const max = Math.max(...values) * 1.08;
  const at = (value: number) => ((value - min) / (max - min)) * 100;
  const pct = (value: number) => `${at(value)}%`;
  return (
    <div className="pt-7 pb-1" dir="ltr">
      <div className="relative h-3 rounded-full bg-surface-2">
        <div className="absolute inset-y-0 rounded-full bg-gradient-to-r from-good/50 via-warn/40 to-bad/50" style={{ left: pct(low), right: `${100 - at(high)}%` }} />
        <Marker at={at(market)} label={labels.market} value={euro(market)} className="bg-text" top />
        {price != null && <Marker at={at(price)} label={labels.price} value={euro(price)} className="bg-accent" />}
      </div>
      {/* The range ends sit below the price label so the two never cover each other on a phone. */}
      <div className={cx("flex justify-between text-[11px] text-faint", price != null ? "mt-8" : "mt-1.5")}>
        <Num>{euro(low)}</Num>
        <Num>{euro(high)}</Num>
      </div>
    </div>
  );
}

function Marker({ at, label, value, className, top }: { at: number; label: string; value: string; className: string; top?: boolean }) {
  // Near an end the label is anchored to that side instead of centred, so it stays inside the card.
  const anchor = at < 18 ? "left-0" : at > 82 ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${at}%` }}>
      <div className={cx("size-4 rounded-full border-2 border-surface shadow", className)} />
      <div className={cx("absolute whitespace-nowrap text-[11px] font-semibold", anchor, top ? "bottom-5" : "top-5")}>
        {label} <span className="num">{value}</span>
      </div>
    </div>
  );
}

interface Point {
  x: number;
  y: number;
  label?: string;
  href?: string;
}

/** Comparable cars as price over mileage, the car being valued highlighted. */
export function Scatter({ points, target, marketY, xLabel, yLabel, targetLabel }: { points: Point[]; target?: Point | null; marketY?: number | null; xLabel: string; yLabel: string; targetLabel: string }) {
  const [hover, setHover] = useState<Point | null>(null);
  const width = 640;
  const height = 300;
  const pad = { l: 64, r: 16, t: 16, b: 40 };
  const all = [...points, ...(target ? [target] : [])];
  const xs = all.map((p) => p.x);
  const ys = [...all.map((p) => p.y), ...(marketY ? [marketY] : [])];
  const [x0, x1] = [Math.min(...xs) * 0.95, Math.max(...xs) * 1.05];
  const [y0, y1] = [Math.min(...ys) * 0.9, Math.max(...ys) * 1.08];
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (width - pad.l - pad.r);
  const sy = (y: number) => height - pad.b - ((y - y0) / (y1 - y0 || 1)) * (height - pad.t - pad.b);
  const ticks = (low: number, high: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => low + ((high - low) * i) / n);
  if (!points.length) return null;
  return (
    <div className="relative" dir="ltr">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={yLabel}>
        {ticks(y0, y1).map((y) => (
          <g key={`y${y}`}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(y)} y2={sy(y)} stroke="var(--line)" strokeDasharray="3 4" />
            <text x={pad.l - 8} y={sy(y) + 4} textAnchor="end" fontSize="11" fill="var(--faint)">
              {number(Math.round(y / 100) * 100)}
            </text>
          </g>
        ))}
        {ticks(x0, x1).map((x) => (
          <text key={`x${x}`} x={sx(x)} y={height - pad.b + 18} textAnchor="middle" fontSize="11" fill="var(--faint)">
            {number(Math.round(x / 1000))}k
          </text>
        ))}
        <text x={(width + pad.l) / 2} y={height - 4} textAnchor="middle" fontSize="11" fill="var(--muted)">
          {xLabel}
        </text>
        {marketY && (
          <g>
            <line x1={pad.l} x2={width - pad.r} y1={sy(marketY)} y2={sy(marketY)} stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="6 4" />
          </g>
        )}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={hover === p ? 7 : 5}
            fill="var(--accent-2)"
            fillOpacity={0.75}
            stroke="var(--surface)"
            strokeWidth="1.5"
            className="cursor-pointer transition-all"
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover(null)}
            onClick={() => p.href && window.open(p.href, "_blank", "noopener")}
          />
        ))}
        {target && (
          <g>
            <circle cx={sx(target.x)} cy={sy(target.y)} r={11} fill="var(--accent)" fillOpacity={0.18} />
            <circle cx={sx(target.x)} cy={sy(target.y)} r={6.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
            <text x={sx(target.x)} y={sy(target.y) - 14} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--accent)">
              {targetLabel}
            </text>
          </g>
        )}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
          <div className="font-semibold">{euro(hover.y)}</div>
          <div className="text-muted">
            {fmtKm(hover.x)} {hover.label ? `· ${hover.label}` : ""}
          </div>
        </div>
      )}
    </div>
  );
}

/** Resale minus each part of the purchase and costs, down to the profit. */
export function Waterfall({ items }: { items: { label: string; value: number; total?: boolean }[] }) {
  const id = useId();
  const steps = useMemo(() => {
    let running = 0;
    return items.map((item) => {
      const start = item.total ? 0 : running;
      const end = item.total ? item.value : running + item.value;
      if (!item.total) running = end;
      return { ...item, start, end };
    });
  }, [items]);
  const max = Math.max(...steps.flatMap((s) => [s.start, s.end]), 1);
  const min = Math.min(...steps.flatMap((s) => [s.start, s.end]), 0);
  const span = max - min || 1;
  return (
    <div className="space-y-2.5" dir="ltr">
      {steps.map((step, i) => {
        const left = ((Math.min(step.start, step.end) - min) / span) * 100;
        const width = Math.max((Math.abs(step.end - step.start) / span) * 100, 0.8);
        const color = step.total ? (step.value >= 0 ? "var(--good)" : "var(--bad)") : step.value >= 0 ? "var(--accent-2)" : "var(--bad)";
        return (
          <div key={`${id}${i}`} className="grid grid-cols-[minmax(5.5rem,9rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-muted" dir="auto">
              {step.label}
            </span>
            <div className="relative h-6 rounded-md bg-surface-2">
              <div className="absolute inset-y-0 rounded-md transition-all" style={{ left: `${left}%`, width: `${width}%`, background: color, opacity: step.total ? 1 : 0.8 }} />
            </div>
            <span className={cx("num w-24 text-end font-semibold", step.total && (step.value >= 0 ? "text-good" : "text-bad"))}>
              {step.value > 0 && !step.total ? "+" : ""}
              {euro(step.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Simple horizontal bars, e.g. profit per car. */
export function Bars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className="space-y-2" dir="ltr">
      {data.map((d, i) => (
        <div key={i} className="grid grid-cols-[minmax(6rem,11rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-muted" dir="auto">
            {d.label}
          </span>
          <div className="h-5 rounded-md bg-surface-2">
            <div className="h-full rounded-md" style={{ width: `${(Math.abs(d.value) / max) * 100}%`, background: d.value >= 0 ? "var(--good)" : "var(--bad)" }} />
          </div>
          <span className={cx("num w-20 text-end font-semibold", d.value >= 0 ? "text-good" : "text-bad")}>{euro(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i / (values.length - 1)) * 100},${30 - ((v - min) / (max - min || 1)) * 26 - 2}`)
    .join(" ");
  const falling = values[values.length - 1] < values[0];
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cx("h-8 w-24", className)}>
      <path d={path} fill="none" stroke={falling ? "var(--good)" : "var(--bad)"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Meter({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex gap-1" dir="ltr" aria-label={`${value}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={cx("h-2 w-6 rounded-full", i < value ? (value >= 4 ? "bg-good" : value >= 3 ? "bg-warn" : "bg-bad") : "bg-line")} />
      ))}
    </div>
  );
}
