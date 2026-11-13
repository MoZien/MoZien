import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { euro, km as fmtKm, number } from "../lib/format";
import { EASE } from "./motion";
import { type Tone, cx, Num } from "./ui";

export function scoreTone(score: number) {
  return score >= 70 ? "good" : score >= 45 ? "warn" : "bad";
}

/** Text color class for a score (full class names, so Tailwind sees them). */
export function scoreText(score: number) {
  return { good: "text-good", warn: "text-warn", bad: "text-bad" }[scoreTone(score)];
}

const toneColor: Record<Tone, string> = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", neutral: "var(--faint)", accent: "var(--accent)" };

/** The score (0–100) as a speedometer: the arc fills up to the score in the verdict's colour, a
 *  knob runs along with it and the number counts up. */
export function Gauge({ score, tone, label, size = 216 }: { score: number; tone: Tone; label: string; size?: number }) {
  const reduce = useReducedMotion();
  const value = useMotionValue(reduce ? score : 0);
  const number = useRef<HTMLSpanElement>(null);
  const R = 84;
  const color = toneColor[tone];
  useEffect(() => {
    if (reduce) {
      value.set(score);
      if (number.current) number.current.textContent = String(score);
      return;
    }
    const controls = animate(value, score, {
      duration: 1.25,
      ease: EASE,
      delay: 0.15,
      onUpdate: (current) => {
        if (number.current) number.current.textContent = String(Math.round(current));
      },
    });
    return () => controls.stop();
  }, [score, reduce, value]);
  const length = useTransform(value, (v) => Math.max(0.004, Math.min(1, v / 100)));
  const cx_ = useTransform(value, (v) => 100 - R * Math.cos((Math.PI * Math.min(100, Math.max(0, v))) / 100));
  const cy_ = useTransform(value, (v) => 100 - R * Math.sin((Math.PI * Math.min(100, Math.max(0, v))) / 100));
  const arc = `M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`;
  return (
    <div className="relative mx-auto" style={{ width: size, maxWidth: "100%" }} dir="ltr" role="img" aria-label={`${label}: ${score}/100`}>
      <svg viewBox="0 0 200 112" className="block w-full overflow-visible">
        {/* The three zones, faint: avoid · look closer · good. */}
        <path d={arc} pathLength={100} fill="none" stroke="var(--bad)" strokeOpacity="0.18" strokeWidth="12" strokeLinecap="round" strokeDasharray="43 100" />
        <path d={arc} pathLength={100} fill="none" stroke="var(--warn)" strokeOpacity="0.2" strokeWidth="12" strokeDasharray="23 100" strokeDashoffset="-46" />
        <path d={arc} pathLength={100} fill="none" stroke="var(--good)" strokeOpacity="0.2" strokeWidth="12" strokeLinecap="round" strokeDasharray="28 100" strokeDashoffset="-72" />
        <motion.path d={arc} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" style={{ pathLength: length, filter: `drop-shadow(0 4px 10px color-mix(in srgb, ${color} 55%, transparent))` }} />
        <motion.circle r="9" fill="var(--surface)" stroke={color} strokeWidth="5" cx={cx_} cy={cy_} />
        {[0, 25, 50, 75, 100].map((tick) => {
          const angle = (Math.PI * tick) / 100;
          return (
            <text key={tick} x={100 - (R - 20) * Math.cos(angle)} y={100 - (R - 20) * Math.sin(angle) + 3} textAnchor="middle" fontSize="8" fill="var(--faint)">
              {tick}
            </text>
          );
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span ref={number} className="num text-[44px] font-bold leading-none tracking-tight" style={{ color }}>
          {reduce ? score : 0}
        </span>
        <span className="eyebrow mt-1">{label}</span>
      </div>
    </div>
  );
}

/** A small ring with the score in it, for cards and rows. */
export function MiniScore({ score, tone, size = 40 }: { score: number; tone: Tone; size?: number }) {
  const r = 16;
  const length = 2 * Math.PI * r;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} dir="ltr" aria-label={`${score}/100`}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--line)" strokeWidth="3.5" />
        <motion.circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={toneColor[tone]}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={length}
          initial={{ strokeDashoffset: length }}
          animate={{ strokeDashoffset: length * (1 - Math.max(3, score) / 100) }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
        />
      </svg>
      <span className="num relative text-[12px] font-bold">{score}</span>
    </span>
  );
}

/** Where the asking price sits against the typical range of comparable prices. */
export function PriceRange({ low, high, market, price, tone = "neutral", labels }: { low: number; high: number; market: number; price: number | null; tone?: Tone; labels: { market: string; price: string } }) {
  const values = [low, high, market, ...(price ? [price] : [])];
  const min = Math.min(...values) * 0.9;
  const max = Math.max(...values) * 1.08;
  const at = (value: number) => ((value - min) / (max - min)) * 100;
  const pct = (value: number) => `${at(value)}%`;
  const color = tone === "neutral" ? "var(--text)" : toneColor[tone];
  return (
    <div className="pb-1 pt-8" dir="ltr">
      <div className="relative h-2.5 rounded-full bg-surface-2">
        <motion.div
          className="bg-brand-soft absolute inset-y-0 rounded-full ring-1 ring-accent/20"
          style={{ left: pct(low), right: `${100 - at(high)}%`, originX: 0.5 }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.2 }}
        />
        <Marker at={at(market)} from={at(market)} label={labels.market} value={euro(market)} color="var(--faint)" muted top />
        {price != null && <Marker at={at(price)} from={at(market)} label={labels.price} value={euro(price)} color={color} />}
      </div>
      {/* The range ends sit below the price label so the two never cover each other on a phone. */}
      <div className={cx("flex justify-between text-[11px] text-faint", price != null ? "mt-9" : "mt-2")}>
        <Num>{euro(low)}</Num>
        <Num>{euro(high)}</Num>
      </div>
    </div>
  );
}

function Marker({ at, from, label, value, color, top, muted }: { at: number; from: number; label: string; value: string; color: string; top?: boolean; muted?: boolean }) {
  // Near an end the label is anchored to that side instead of centred, so it stays inside the card.
  const anchor = at < 18 ? "left-0" : at > 82 ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <motion.div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" initial={{ left: `${from}%`, opacity: 0 }} animate={{ left: `${at}%`, opacity: 1 }} transition={{ duration: 0.9, ease: EASE, delay: 0.35 }}>
      <div className={cx("rounded-full border-[3px] border-surface shadow-[0_2px_6px_rgba(11,19,36,0.25)]", muted ? "size-3.5" : "size-5")} style={{ background: color }} />
      <div className={cx("absolute whitespace-nowrap text-[11px]", muted ? "text-muted" : "font-semibold", anchor, top ? "bottom-5" : "top-6")} style={muted ? undefined : { color }}>
        {label} <span className="num">{value}</span>
      </div>
    </motion.div>
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
  // Drawn at the real pixel size, so labels stay readable on a phone and do not grow on a desktop.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = width < 500 ? 240 : 310;
  const pad = { l: 46, r: 12, t: 26, b: 38 };
  const all = [...points, ...(target ? [target] : [])];
  const xs = all.map((p) => p.x);
  const ys = [...all.map((p) => p.y), ...(marketY ? [marketY] : [])];
  const [x0, x1] = [Math.min(...xs) * 0.95, Math.max(...xs) * 1.05];
  const [y0, y1] = [Math.min(...ys) * 0.9, Math.max(...ys) * 1.08];
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (width - pad.l - pad.r);
  const sy = (y: number) => height - pad.b - ((y - y0) / (y1 - y0 || 1)) * (height - pad.t - pad.b);
  const ticks = (low: number, high: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => low + ((high - low) * i) / n);
  const gradient = useId();
  if (!points.length) return null;
  return (
    <div ref={box} className="relative" dir="ltr">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block max-w-full" role="img" aria-label={yLabel}>
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.1" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks(y0, y1).map((y) => (
          <g key={`y${y}`}>
            <line x1={pad.l} x2={width - pad.r} y1={sy(y)} y2={sy(y)} stroke="var(--line)" strokeDasharray="3 5" />
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
            <rect x={pad.l} y={sy(marketY)} width={width - pad.l - pad.r} height={Math.max(0, height - pad.b - sy(marketY))} fill={`url(#${gradient})`} />
            <motion.line x1={pad.l} x2={width - pad.r} y1={sy(marketY)} y2={sy(marketY)} stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="6 5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} />
            <text x={width - pad.r} y={sy(marketY) - 6} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--accent)">
              {yLabel}
            </text>
          </g>
        )}
        {points.map((p, i) => (
          <motion.circle
            key={i}
            cx={sx(p.x)}
            cy={sy(p.y)}
            fill="var(--muted)"
            fillOpacity={0.55}
            stroke="var(--surface)"
            strokeWidth="1.5"
            className="cursor-pointer"
            initial={{ r: 0 }}
            animate={{ r: hover === p ? 7 : 4.5 }}
            transition={{ duration: 0.3, ease: EASE, delay: hover === p ? 0 : Math.min(0.6, i * 0.015) }}
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover(null)}
            onClick={() => p.href && window.open(p.href, "_blank", "noopener")}
          />
        ))}
        {target && (
          <g>
            <circle cx={sx(target.x)} cy={sy(target.y)} r={8} fill="var(--accent)" fillOpacity={0.25}>
              <animate attributeName="r" values="8;18;8" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="fill-opacity" values="0.3;0;0.3" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <motion.circle cx={sx(target.x)} cy={sy(target.y)} fill="var(--accent)" stroke="var(--surface)" strokeWidth="2.5" initial={{ r: 0 }} animate={{ r: 7 }} transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.5 }} />
            <text x={Math.min(width - pad.r - 30, Math.max(pad.l + 30, sx(target.x)))} y={sy(target.y) - 15} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text)">
              {targetLabel}
            </text>
          </g>
        )}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop">
          <div className="num font-semibold">{euro(hover.y)}</div>
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
        const color = step.total ? (step.value >= 0 ? "var(--good)" : "var(--bad)") : step.value >= 0 ? "var(--muted)" : "var(--bad)";
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

/** Simple horizontal bars, e.g. profit per car; they grow in. Name and sum above, the bar below. */
export function Bars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className="space-y-3.5">
      {data.map((d, i) => (
        <div key={i} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-muted" dir="auto">
              {d.label}
            </span>
            <span className={cx("num shrink-0 font-semibold", d.value >= 0 ? "text-good" : "text-bad")}>{euro(d.value)}</span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2" dir="ltr">
            <motion.div
              className="h-full rounded-full"
              style={{ background: d.value >= 0 ? "linear-gradient(90deg, color-mix(in srgb, var(--good) 55%, transparent), var(--good))" : "linear-gradient(90deg, color-mix(in srgb, var(--bad) 55%, transparent), var(--bad))" }}
              initial={{ width: 0 }}
              animate={{ width: `${(Math.abs(d.value) / max) * 100}%` }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.1 + i * 0.06 }}
            />
          </div>
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
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={className ?? "h-8 w-24"}>
      <path d={path} fill="none" stroke={falling ? "var(--good)" : "var(--bad)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
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
