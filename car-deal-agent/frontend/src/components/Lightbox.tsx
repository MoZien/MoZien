import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "./ui";

/** Kleinanzeigen serves each photo in several sizes, chosen by the "rule" parameter:
 *  2 = 200 px, 35 = 300 px, 59 = 960 px, 57 = 1600 px. */
export function photoSize(url: string, rule: 2 | 35 | 59 | 57): string {
  if (/rule=\$_\d+\.AUTO/.test(url)) return url.replace(/rule=\$_\d+\.AUTO/, `rule=$_${rule}.AUTO`);
  // AutoScout24 puts the size in the path: …/1280x960.webp
  const autoscout = { 2: "250x188", 35: "250x188", 59: "720x540", 57: "1280x960" }[rule];
  return /\/\d+x\d+\.webp$/.test(url) ? url.replace(/\/\d+x\d+\.webp$/, `/${autoscout}.webp`) : url;
}

const MAX_ZOOM = 4;
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

interface View {
  scale: number;
  x: number;
  y: number;
}

/** Photos full screen: swipe between them, pinch or double-tap to zoom, drag when zoomed. */
export function Lightbox({ images, start, onClose }: { images: string[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [drag, setDrag] = useState(0); // horizontal swipe offset while the finger moves
  const [animate, setAnimate] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; view: View; dist?: number; moved: boolean; time: number } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const count = images.length;

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= count) return;
      setAnimate(true);
      setIndex(to);
      setView({ scale: 1, x: 0, y: 0 });
      setDrag(0);
    },
    [count],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [index, go, onClose]);

  // The neighbours load in the background, so swiping shows them at once.
  useEffect(() => {
    for (const i of [index - 1, index + 1]) if (images[i]) new Image().src = photoSize(images[i], 57);
  }, [index, images]);

  function bounded(next: View): View {
    const box = stage.current?.getBoundingClientRect();
    if (!box || next.scale <= 1) return { scale: 1, x: 0, y: 0 };
    const maxX = ((next.scale - 1) * box.width) / 2;
    const maxY = ((next.scale - 1) * box.height) / 2;
    return { scale: next.scale, x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }

  function onDown(event: ReactPointerEvent) {
    if ((event.target as HTMLElement).closest("button")) return; // the arrows handle their own clicks
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    setAnimate(false);
    if (points.length === 2) {
      const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      gesture.current = { x: 0, y: 0, view, dist, moved: true, time: Date.now() };
    } else if (points.length === 1) {
      gesture.current = { x: event.clientX, y: event.clientY, view, moved: false, time: Date.now() };
    }
  }

  function onMove(event: ReactPointerEvent) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    const g = gesture.current;
    if (points.length >= 2 && g.dist) {
      const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const scale = clamp((g.view.scale * dist) / g.dist, 1, MAX_ZOOM);
      setView(bounded({ scale, x: g.view.x * (scale / g.view.scale), y: g.view.y * (scale / g.view.scale) }));
      return;
    }
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.moved = true;
    if (g.view.scale > 1) setView(bounded({ scale: g.view.scale, x: g.view.x + dx, y: g.view.y + dy }));
    else setDrag(dx);
  }

  function onUp(event: ReactPointerEvent) {
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (!g || pointers.current.size > 0) {
      if (g && pointers.current.size === 1) {
        // One finger left after a pinch: continue as a drag from here.
        const [rest] = [...pointers.current.values()];
        gesture.current = { x: rest.x, y: rest.y, view, moved: true, time: Date.now() };
      }
      return;
    }
    gesture.current = null;
    if (view.scale <= 1.02) setView({ scale: 1, x: 0, y: 0 });
    if (view.scale <= 1 && Math.abs(drag) > 0) {
      const width = stage.current?.clientWidth ?? 400;
      if (drag < -Math.min(80, width / 5)) go(index + 1);
      else if (drag > Math.min(80, width / 5)) go(index - 1);
      else {
        setAnimate(true);
        setDrag(0);
      }
      return;
    }
    if (!g.moved) {
      const now = Date.now();
      const tap = lastTap.current;
      if (tap && now - tap.time < 300 && Math.hypot(tap.x - event.clientX, tap.y - event.clientY) < 30) {
        // Double tap: zoom in on that spot, or back out.
        lastTap.current = null;
        setAnimate(true);
        if (view.scale > 1) setView({ scale: 1, x: 0, y: 0 });
        else {
          const box = stage.current!.getBoundingClientRect();
          const zoom = 2.5;
          setView(bounded({ scale: zoom, x: (box.left + box.width / 2 - event.clientX) * (zoom - 1), y: (box.top + box.height / 2 - event.clientY) * (zoom - 1) }));
        }
      } else {
        lastTap.current = { time: now, x: event.clientX, y: event.clientY };
      }
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black text-white" role="dialog" aria-modal="true" dir="ltr">
      <div className="safe-top flex shrink-0 items-center justify-between px-4 py-3">
        <span className="num text-sm text-white/80">
          {index + 1} / {count}
        </span>
        <button onClick={onClose} aria-label="close" className="grid size-10 cursor-pointer place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <X className="size-5" />
        </button>
      </div>

      <div
        ref={stage}
        className="relative min-h-0 flex-1 touch-none overflow-hidden select-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          className={cx("flex h-full", animate && "transition-transform duration-300 ease-out")}
          style={{ transform: `translateX(calc(${-index * 100}% + ${drag}px))` }}
        >
          {images.map((src, i) => (
            <div key={src + i} className="grid h-full w-full shrink-0 place-items-center overflow-hidden">
              {Math.abs(i - index) <= 1 && (
                <img
                  src={photoSize(src, 57)}
                  onError={(event) => {
                    if (event.currentTarget.src !== src) event.currentTarget.src = src;
                  }}
                  alt=""
                  draggable={false}
                  referrerPolicy="no-referrer"
                  className={cx("max-h-full max-w-full object-contain", animate && "transition-transform duration-200")}
                  style={i === index ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` } : undefined}
                />
              )}
            </div>
          ))}
        </div>
        {index > 0 && (
          <button onClick={() => go(index - 1)} aria-label="previous" className="absolute start-3 top-1/2 hidden size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/10 hover:bg-white/20 sm:grid">
            <ChevronLeft className="size-6" />
          </button>
        )}
        {index < count - 1 && (
          <button onClick={() => go(index + 1)} aria-label="next" className="absolute end-3 top-1/2 hidden size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/10 hover:bg-white/20 sm:grid">
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="safe-bottom shrink-0">
          <div className="no-scrollbar flex justify-start gap-1.5 overflow-x-auto px-4 py-3 sm:justify-center">
            {images.map((src, i) => (
              <button key={src + i} onClick={() => go(i)} className={cx("size-12 shrink-0 cursor-pointer overflow-hidden rounded-md border-2", i === index ? "border-white" : "border-transparent opacity-50")}>
                <img src={photoSize(src, 2)} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
