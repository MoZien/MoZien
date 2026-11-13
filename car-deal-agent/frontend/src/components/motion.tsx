import { animate, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

// Motion helpers shared by every screen. All of them respect "reduce motion" (MotionConfig in
// App.tsx turns transforms off; the numbers then appear at once).

export const EASE = [0.2, 0.8, 0.2, 1] as const;
export const SPRING = { type: "spring", stiffness: 520, damping: 40, mass: 0.9 } as const;
export const SPRING_SOFT = { type: "spring", stiffness: 260, damping: 30 } as const;

/** Fades and lifts its content in once, when it is first shown. */
export function Reveal({ children, className, delay = 0, y = 12 }: { children: ReactNode; className?: string; delay?: number; y?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: EASE, delay }}>
      {children}
    </motion.div>
  );
}

const group = (gap: number, delay: number) => ({ hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: delay } } });
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } };

/** Children (StaggerItem) come in one after the other. */
export function Stagger({ children, className, gap = 0.055, delay = 0 }: { children: ReactNode; className?: string; gap?: number; delay?: number }) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={group(gap, delay)}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}

/** A number that counts up to its value (and on from there when the value changes). */
export function CountUp({ value, format = (n: number) => String(Math.round(n)), className, duration = 0.95 }: { value: number; format?: (n: number) => string; className?: string; duration?: number }) {
  const node = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const reduce = useReducedMotion();
  const formatter = useRef(format);
  formatter.current = format;
  useEffect(() => {
    const element = node.current;
    if (!element) return;
    if (reduce) {
      shown.current = value;
      element.textContent = formatter.current(value);
      return;
    }
    const controls = animate(shown.current, value, {
      duration,
      ease: EASE,
      onUpdate: (current) => {
        shown.current = current;
        element.textContent = formatter.current(current);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduce]);
  return (
    <span ref={node} className={className ? `num ${className}` : "num"}>
      {format(reduce ? value : shown.current)}
    </span>
  );
}

/** True once the page is scrolled a little: the top bar then gets its frosted background. */
export function useScrolled(threshold = 6): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [threshold]);
  return scrolled;
}
