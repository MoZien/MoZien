import { useId } from "react";
import { cx } from "./ui";

// The brand's own pictures: the mark, the name, a car being scanned and the deal radar. All drawn
// here as SVG, so they are sharp at any size and follow the theme.

/** The mark: a roof over a road (a car hall, and an A) on a tile in the brand blue. */
export function LogoMark({ className, draw }: { className?: string; draw?: boolean }) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3e6dff" />
          <stop offset="1" stopColor="#1638c4" />
        </linearGradient>
        <linearGradient id={`${id}-road`} gradientUnits="userSpaceOnUse" x1="17" y1="0" x2="47" y2="0">
          <stop offset="0" stopColor="#8fe9ff" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill={`url(#${id}-tile)`} />
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="16.25" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.5" />
      <path d="M17 40.5 L32 17.5 L47 40.5" stroke="#fff" strokeWidth="6.5" className={draw ? "draw" : undefined} />
      <path d="M17 49 H47" stroke={`url(#${id}-road)`} strokeWidth="5" className={draw ? "draw" : undefined} style={draw ? { animationDelay: "0.35s" } : undefined} />
    </svg>
  );
}

/** Mark and name: "Auto" set heavier than "Halle". `onDark` for the hero and the sign-in. */
export function Logo({ small, onDark }: { small?: boolean; onDark?: boolean }) {
  return (
    <span dir="ltr" className={cx("inline-flex items-center", onDark ? "text-white" : "text-text", small ? "gap-2" : "gap-2.5")}>
      <LogoMark className={small ? "size-7" : "size-8"} />
      <span className={cx("leading-none tracking-[-0.03em]", small ? "text-[19px]" : "text-[21px]")}>
        <span className="font-bold">Auto</span>
        <span className={cx("font-medium", onDark ? "text-white/75" : "text-muted")}>Halle</span>
      </span>
    </span>
  );
}

/** A car in outline with a beam of light running over it: "the car is being checked". `onDark`
 *  draws it in white and cyan (hero), otherwise in the brand colours. */
export function CarScan({ className, onDark, still }: { className?: string; onDark?: boolean; still?: boolean }) {
  const id = useId();
  const from = onDark ? "#ffffff" : "var(--accent)";
  const to = onDark ? "#7fe3ff" : "var(--accent-2)";
  return (
    <div className={cx("relative overflow-hidden", className)} dir="ltr" aria-hidden="true">
      <svg viewBox="0 0 320 124" className="block w-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <defs>
          <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={to} stopOpacity="0.16" />
            <stop offset="1" stopColor={to} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* the road */}
        <path d="M6 108 H314" stroke={`url(#${id}-line)`} strokeOpacity="0.35" strokeWidth="2" strokeDasharray="2 9" />
        {/* body */}
        <path
          d="M20 90 C17 78 20 67 31 63 L62 57 C79 39 97 29 125 27 L176 27 C200 29 217 41 233 57 L281 63 C297 65 303 73 303 85 L303 90 L261 90 A25 25 0 0 0 211 90 L109 90 A25 25 0 0 0 59 90 Z"
          fill={`url(#${id}-fill)`}
          stroke={`url(#${id}-line)`}
          strokeWidth="2.6"
        />
        {/* glass, door, lights */}
        <path d="M82 55 C94 43 108 35 127 34 L150 34 L150 55 Z M160 34 L175 34 C193 36 205 45 215 55 L160 55 Z" stroke={`url(#${id}-line)`} strokeOpacity="0.75" strokeWidth="2" />
        <path d="M155 60 V86 M168 66 H180" stroke={`url(#${id}-line)`} strokeOpacity="0.5" strokeWidth="2" />
        <path d="M288 70 L299 73" stroke={to} strokeWidth="3.4" />
        <path d="M23 72 L32 69" stroke={onDark ? "#ff8f8f" : "var(--bad)"} strokeWidth="3.4" />
        {/* wheels */}
        {[84, 236].map((x) => (
          <g key={x}>
            <circle cx={x} cy="90" r="18" stroke={`url(#${id}-line)`} strokeWidth="2.6" />
            <circle cx={x} cy="90" r="7" stroke={`url(#${id}-line)`} strokeOpacity="0.7" strokeWidth="2" />
          </g>
        ))}
      </svg>
      {!still && (
        <>
          <span className="animate-scan absolute inset-y-0 start-0 w-[18%]" style={{ background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${to} 30%, transparent) 45%, color-mix(in srgb, ${to} 85%, transparent) 50%, color-mix(in srgb, ${to} 30%, transparent) 55%, transparent)` }} />
          {[
            ["28%", "38%", "0.4s"],
            ["58%", "30%", "1.1s"],
            ["80%", "56%", "1.7s"],
          ].map(([left, top, delay]) => (
            <span key={left} className="animate-blip absolute size-2 rounded-full" style={{ left, top, background: to, boxShadow: `0 0 0 4px color-mix(in srgb, ${to} 30%, transparent)`, animationDelay: delay, animationDuration: "2.6s" }} />
          ))}
        </>
      )}
    </div>
  );
}

/** The deal radar: rings, a turning beam and cars that light up. */
export function RadarSweep({ className, found = 0 }: { className?: string; found?: number }) {
  const blips = [
    ["24%", "30%", "0.2s"],
    ["66%", "22%", "1.2s"],
    ["72%", "64%", "2s"],
    ["30%", "70%", "0.8s"],
  ];
  return (
    <div className={cx("relative aspect-square shrink-0 overflow-hidden rounded-full border border-accent/25 bg-accent/5", className)} dir="ltr" aria-hidden="true">
      <span className="absolute inset-[17%] rounded-full border border-accent/20" />
      <span className="absolute inset-[34%] rounded-full border border-accent/20" />
      <span className="absolute inset-x-0 top-1/2 h-px bg-accent/15" />
      <span className="absolute inset-y-0 left-1/2 w-px bg-accent/15" />
      <span className="animate-radar absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, transparent 0deg, transparent 290deg, color-mix(in srgb, var(--accent) 55%, transparent) 360deg)" }} />
      {blips.slice(0, Math.max(1, Math.min(4, found + 1))).map(([left, top, delay]) => (
        <span key={left} className="animate-blip absolute size-1.5 rounded-full bg-accent-2" style={{ left, top, animationDelay: delay, boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent-2) 30%, transparent)" }} />
      ))}
      <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_25%,transparent)]" />
    </div>
  );
}
