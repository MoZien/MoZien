import { Check, ChevronDown, ChevronRight, Info, Loader2, X } from "lucide-react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { EASE, SPRING } from "./motion";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("num", className)}>{children}</span>;
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx("rounded-card border border-line bg-surface shadow-card", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, icon, action, sub }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <IconTile size="sm">{icon}</IconTile>}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold">{title}</h3>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// --- colours ----------------------------------------------------------------------------------

export type Tone = "good" | "warn" | "bad" | "neutral" | "accent";
const tones: Record<Tone, string> = {
  good: "bg-good/10 text-good border-good/20",
  warn: "bg-warn/10 text-warn border-warn/25",
  bad: "bg-bad/10 text-bad border-bad/20",
  neutral: "bg-surface-2 text-muted border-line",
  accent: "bg-accent/10 text-accent border-accent/20",
};

export type Hue = Tone | "violet" | "cyan";
const hues: Record<Hue, string> = {
  good: "bg-good/12 text-good",
  warn: "bg-warn/14 text-warn",
  bad: "bg-bad/12 text-bad",
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent/12 text-accent",
  violet: "bg-violet/12 text-violet",
  cyan: "bg-accent-2/14 text-accent-2",
};

/** An icon on a softly coloured, rounded square: the mark of a section, a tool, a list row. */
export function IconTile({ children, hue = "accent", size = "md", className }: { children: ReactNode; hue?: Hue; size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = { sm: "size-8 rounded-[10px]", md: "size-10 rounded-xl", lg: "size-12 rounded-2xl" };
  return <span className={cx("grid shrink-0 place-items-center", sizes[size], hues[hue], className)}>{children}</span>;
}

// --- buttons ----------------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft" | "ink" | "white";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-glow hover:brightness-110",
  secondary: "border border-line-strong bg-surface hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface-2 hover:text-text",
  danger: "border border-bad/30 bg-surface text-bad hover:bg-bad/8",
  soft: "bg-surface-2 text-text hover:bg-surface-3",
  ink: "bg-ink text-on-ink hover:opacity-90",
  white: "bg-white text-[#0b1324] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] hover:bg-white/90",
};
const sizes = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5 rounded-xl",
  md: "h-11 px-[1.125rem] text-sm gap-2 rounded-[14px]",
  lg: "h-[52px] px-6 text-[15px] gap-2.5 rounded-2xl font-semibold",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes; icon?: ReactNode; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        "inline-flex shrink-0 cursor-pointer select-none items-center justify-center font-medium transition duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:active:scale-100",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      // A size given by the caller replaces the default one (two size classes would fight).
      className={cx("grid cursor-pointer place-items-center rounded-xl text-muted transition duration-200 hover:bg-surface-2 hover:text-text active:scale-90", !/(^|\s)size-/.test(className ?? "") && "size-10", className)}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

/** A small rounded label, e.g. one search criterion or one fact. */
export function Chip({ children, icon, className }: { children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[13px] font-medium", className)}>
      {icon && <span className="text-muted">{icon}</span>}
      {children}
    </span>
  );
}

// --- fields -----------------------------------------------------------------------------------

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-snug text-faint">{hint}</span>}
    </label>
  );
}

const inputClass =
  "h-12 w-full rounded-field border border-line-strong bg-surface px-3.5 text-sm outline-none transition duration-200 placeholder:text-faint hover:border-faint focus:border-accent focus:ring-4 focus:ring-accent/15";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(inputClass, className)} />;
}

export function NumberInput({
  value,
  onChange,
  suffix,
  min,
  max,
  step,
  placeholder,
  allowEmpty,
  className,
  ...rest
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  allowEmpty?: boolean;
  className?: string;
  "aria-label"?: string;
  name?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    if (value == null ? text !== "" : Number(text.replace(",", ".")) !== value) setText(value == null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    // Numbers read left to right in every language, so the field (and its unit) is LTR.
    <div dir="ltr" className={cx("relative", className)}>
      <input
        {...rest}
        inputMode="decimal"
        className={cx(inputClass, "tabular-nums", suffix && "pr-12")}
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          if (raw.trim() === "") {
            if (allowEmpty) onChange(null);
            return;
          }
          const parsed = Number(raw.replace(",", "."));
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
        onBlur={() => {
          if (value == null) return;
          let next = value;
          if (min != null) next = Math.max(next, min);
          if (max != null) next = Math.min(next, max);
          if (step != null && step >= 1) next = Math.round(next / step) * step;
          if (next !== value) onChange(next);
          setText(String(next));
        }}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3.5 grid place-items-center text-xs font-medium text-faint">{suffix}</span>}
    </div>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...rest} className={cx(inputClass, "cursor-pointer appearance-none pe-9", className)}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
    </div>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(inputClass, "h-auto min-h-28 py-3 leading-relaxed", className)} />;
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex w-full cursor-pointer items-center justify-between gap-4 py-1.5 text-start"
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-faint">{hint}</span>}
      </span>
      <span className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300", checked ? "bg-brand" : "bg-line-strong")}>
        <span
          className={cx(
            "absolute top-0.5 size-6 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)] transition-all duration-300 ease-[cubic-bezier(0.3,1.4,0.5,1)] group-active:w-7",
            checked ? "start-[1.375rem] group-active:start-[1.125rem]" : "start-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** A few choices side by side; a thumb slides to the chosen one. `onDark` for use on the hero. */
export function Segmented<V extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  onDark,
}: {
  value: V;
  onChange: (value: V) => void;
  options: { value: V; label: ReactNode; icon?: ReactNode }[];
  className?: string;
  size?: "sm" | "md";
  onDark?: boolean;
}) {
  const id = useId();
  return (
    <div role="radiogroup" className={cx("inline-flex p-1", size === "sm" ? "rounded-xl" : "rounded-[14px]", onDark ? "bg-white/10 ring-1 ring-white/15" : "bg-surface-2 ring-1 ring-line", className)}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cx(
              "relative flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-200",
              size === "sm" ? "h-7 rounded-lg px-2.5 text-xs" : "h-10 rounded-[10px] px-2 text-[13.5px] sm:px-3.5 sm:text-sm",
              active ? (onDark ? "text-[#0b1324]" : "text-text") : onDark ? "text-white/70 hover:text-white" : "text-muted hover:text-text",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={SPRING}
                className={cx("absolute inset-0", size === "sm" ? "rounded-lg" : "rounded-[10px]", onDark ? "bg-white shadow-lg" : "bg-surface shadow-[0_1px_3px_rgba(11,19,36,0.12)] ring-1 ring-line dark:bg-surface-3 dark:ring-line-strong")}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {option.icon}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The parts of a page as pills; the chosen one is filled, the fill slides over. */
export function Tabs<V extends string>({ value, onChange, tabs }: { value: V; onChange: (value: V) => void; tabs: { value: V; label: ReactNode; icon?: ReactNode; badge?: ReactNode }[] }) {
  const id = useId();
  return (
    <div role="tablist" className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl bg-surface-2 p-1 ring-1 ring-line">
      {tabs.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cx("relative flex h-10 flex-auto cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-[13.5px] font-medium transition-colors duration-200 sm:px-3.5 sm:text-sm", active ? "text-text" : "text-muted hover:text-text")}
          >
            {active && <motion.span layoutId={`tab-${id}`} transition={SPRING} className="absolute inset-0 rounded-xl bg-surface shadow-[0_1px_3px_rgba(11,19,36,0.12)] ring-1 ring-line dark:bg-surface-3 dark:ring-line-strong" />}
            <span className="relative flex items-center gap-1.5">
              {tab.icon}
              {tab.label}
              {tab.badge}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// --- sheet ------------------------------------------------------------------------------------

/** A sheet from the bottom on phones (pull it down to close), a dialog in the middle on larger
 *  screens. The body scrolls; `footer` (the sheet's main button) stays at the bottom. */
export function Modal({ open, onClose, title, children, wide, footer, sub }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode; sub?: ReactNode }) {
  const controls = useDragControls();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  const bottom = "pb-[max(1.25rem,env(safe-area-inset-bottom))]";
  // On <body>: an animated parent would otherwise hold the fixed layer inside itself.
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div aria-hidden="true" className="absolute inset-0 bg-[#060a13]/55 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => (info.offset.y > 110 || info.velocity.y > 700) && onClose()}
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 48 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className={cx("relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-line bg-surface shadow-pop sm:rounded-[28px]", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
          >
            <div className="shrink-0 cursor-grab touch-none active:cursor-grabbing sm:cursor-default" onPointerDown={(event) => window.innerWidth < 640 && controls.start(event)}>
              <span aria-hidden="true" className="mx-auto mt-2.5 block h-1.5 w-10 rounded-full bg-line-strong sm:hidden" />
              <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-3 sm:pt-5">
                <div className="min-w-0">
                  <h2 className="truncate text-[17px] font-semibold">{title}</h2>
                  {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
                </div>
                <IconButton label="close" onClick={onClose} className="-me-2 bg-surface-2">
                  <X className="size-5" />
                </IconButton>
              </div>
            </div>
            <div className={cx("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5", footer ? "pb-4" : bottom)}>{children}</div>
            {footer && <div className={cx("shrink-0 border-t border-line px-5 pt-3", bottom)}>{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// --- page parts -------------------------------------------------------------------------------

/** The title of a page, the same size everywhere: an optional icon, one line below, an action at the side. */
export function PageTitle({ title, sub, action, icon, hue }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; icon?: ReactNode; hue?: Hue }) {
  return (
    <motion.div className="flex items-start justify-between gap-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && (
          <IconTile size="lg" hue={hue} className="mt-0.5 hidden sm:grid">
            {icon}
          </IconTile>
        )}
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold leading-tight lg:text-[32px]">{title}</h1>
          {sub && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{sub}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </motion.div>
  );
}

/** The heading of a section inside a page, with a link or button at its end. */
export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-[17px] font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/** A card that opens and closes on tap. The header says what is inside (a sum, a count), so a
 *  closed card still answers the question. Printing shows every card open. */
export function Fold({
  title,
  summary,
  icon,
  hue,
  defaultOpen = false,
  flush,
  className,
  children,
}: {
  title: ReactNode;
  summary?: ReactNode;
  icon?: ReactNode;
  hue?: Hue;
  defaultOpen?: boolean;
  /** the body has no padding of its own (lists with their own rows) */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <Card className={cx("overflow-hidden", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-3 text-start transition-colors duration-200 hover:bg-surface-2/60 sm:px-5"
      >
        {icon && (
          <IconTile size="sm" hue={hue ?? "neutral"}>
            {icon}
          </IconTile>
        )}
        <span className="min-w-0 flex-1 text-[15px] font-semibold">{title}</span>
        {summary != null && summary !== "" && <span className="max-w-[55%] shrink-0 truncate text-end text-[13px] text-muted">{summary}</span>}
        <ChevronDown className={cx("size-4 shrink-0 text-faint transition-transform duration-300", open && "rotate-180")} />
      </button>
      <motion.div id={id} className="fold-body" initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} transition={{ duration: 0.32, ease: EASE }} inert={!open}>
        <div className={flush ? "border-t border-line" : "px-4 pb-4 pt-0.5 sm:px-5 sm:pb-5"}>{children}</div>
      </motion.div>
    </Card>
  );
}

/** A section that opens on tap: keeps rarely used options out of the way. */
export function Disclosure({ title, children, defaultOpen = false, className }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full cursor-pointer items-center justify-between gap-3 py-2 text-start text-sm font-medium text-muted transition-colors hover:text-text">
        {title}
        <ChevronDown className={cx("size-4 shrink-0 transition-transform duration-300", open && "rotate-180")} />
      </button>
      <motion.div className="fold-body" initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} transition={{ duration: 0.3, ease: EASE }} inert={!open}>
        <div className="pt-2">{children}</div>
      </motion.div>
    </div>
  );
}

/** A grouped list (settings style): rows with dividers in one box. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card", className)}>{children}</div>;
}

/** A row in a List that leads somewhere: icon, title, one line below, chevron. */
export function ListLink({ href, icon, hue, title, sub, onClick, active }: { href: string; icon?: ReactNode; hue?: Hue; title: ReactNode; sub?: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <a href={href} onClick={onClick} className={cx("group flex items-center gap-3.5 px-4 py-3.5 transition-colors duration-200 hover:bg-surface-2", active ? "bg-surface-2" : "bg-surface")}>
      {icon && <IconTile hue={hue}>{icon}</IconTile>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        {sub && <span className="block text-[13px] leading-snug text-muted">{sub}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
    </a>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-muted", className)} />;
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return (
    <motion.div className="flex flex-col items-center px-6 py-14 text-center" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}>
      <div className="relative mb-5 grid size-20 place-items-center">
        <span className="bg-brand-soft absolute inset-0 rounded-[28px]" />
        <span className="absolute -inset-2 rounded-[34px] border border-dashed border-line-strong opacity-70" />
        <span className="relative text-accent">{icon}</span>
      </div>
      <h3 className="text-[17px] font-semibold">{title}</h3>
      {text && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  );
}

export function Stat({ label, value, sub, tone, icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: ReactNode }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "accent" ? "text-accent" : "";
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={cx("mt-1.5 truncate text-[22px] font-bold tracking-tight", color)}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-faint">{sub}</div>}
    </div>
  );
}

export function Note({ children, tone = "neutral", icon }: { children: ReactNode; tone?: Tone; icon?: ReactNode }) {
  return (
    <div className={cx("flex gap-3 rounded-2xl border px-4 py-3.5 text-sm", tones[tone])}>
      <span className="mt-0.5 shrink-0">{icon ?? <Info className="size-4" />}</span>
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("shimmer rounded-xl", className)} />;
}

export function Row({ label, value, strong, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: Tone }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "accent" ? "text-accent" : "";
  return (
    <div className={cx("flex items-baseline justify-between gap-4 py-2 text-sm", strong && "mt-1 border-t border-line pt-3 text-[15px] font-semibold")}>
      <span className={strong ? "text-text" : "text-muted"}>{label}</span>
      <span className={cx("num text-end", color)}>{value}</span>
    </div>
  );
}

/** A thin progress line in the brand colours; `live` keeps a light moving across it. */
export function ProgressLine({ value, live, className }: { value: number; live?: boolean; className?: string }) {
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-surface-2", className)} dir="ltr">
      <div className={cx("bg-brand h-full rounded-full transition-[width] duration-700 ease-out", live && "progress-live")} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

// --- toasts ---------------------------------------------------------------------------------

interface Toast {
  id: number;
  text: string;
  tone: Tone;
}
const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, tone: Tone = "neutral") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar)+5rem)] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-8">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 480, damping: 32 }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-[#0b1324] py-2.5 pe-5 ps-3 text-sm font-medium text-white shadow-pop ring-1 ring-white/10"
            >
              <span className={cx("grid size-6 place-items-center rounded-full", toast.tone === "good" ? "bg-[#37d48d]/20 text-[#37d48d]" : toast.tone === "bad" ? "bg-[#ff6f6f]/20 text-[#ff6f6f]" : "bg-white/10 text-white/80")}>
                {toast.tone === "bad" ? <X className="size-3.5" strokeWidth={3} /> : toast.tone === "good" ? <Check className="size-3.5" strokeWidth={3} /> : <Info className="size-3.5" />}
              </span>
              {toast.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}
