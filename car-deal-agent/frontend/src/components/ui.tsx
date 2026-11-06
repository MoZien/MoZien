import { Check, ChevronDown, ChevronRight, Info, Loader2, X } from "lucide-react";
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
  useState,
} from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("num", className)}>{children}</span>;
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx("rounded-xl border border-line bg-surface", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, icon, action, sub }: { title: ReactNode; icon?: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="shrink-0 text-muted">{icon}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold">{title}</h3>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-on-ink hover:opacity-90",
  secondary: "border border-line-strong bg-surface hover:bg-surface-2",
  ghost: "hover:bg-surface-2 text-muted hover:text-text",
  danger: "border border-bad/30 bg-surface text-bad hover:bg-bad/5",
  soft: "bg-surface-2 text-text hover:bg-line",
};
const sizes = { sm: "h-8 px-3 text-[13px] gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-5 text-[15px] gap-2" };

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
        "inline-flex shrink-0 cursor-pointer select-none items-center justify-center rounded-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
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
      className={cx("grid size-9 cursor-pointer place-items-center rounded-[10px] text-muted transition hover:bg-surface-2 hover:text-text", className)}
    >
      {children}
    </button>
  );
}

export type Tone = "good" | "warn" | "bad" | "neutral" | "accent";
const tones: Record<Tone, string> = {
  good: "bg-good/8 text-good border-good/20",
  warn: "bg-warn/8 text-warn border-warn/20",
  bad: "bg-bad/8 text-bad border-bad/20",
  neutral: "bg-surface-2 text-muted border-line",
  accent: "bg-accent/8 text-accent border-accent/20",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-text">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-[10px] border border-line-strong bg-surface px-3.5 text-sm outline-none transition placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/15";

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
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3.5 grid place-items-center text-xs text-faint">{suffix}</span>}
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
      className="flex w-full cursor-pointer items-center justify-between gap-4 py-1.5 text-start"
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
      <span className={cx("relative h-6 w-10 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-line-strong")}>
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all", checked ? "start-4.5" : "start-0.5")} />
      </span>
    </button>
  );
}

export function Segmented<V extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: V;
  onChange: (value: V) => void;
  options: { value: V; label: ReactNode; icon?: ReactNode }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" className={cx("inline-flex rounded-[10px] bg-surface-2 p-0.5 ring-1 ring-line", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            "flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] font-medium transition",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
            value === option.value ? "bg-surface text-text shadow-sm ring-1 ring-line" : "text-muted hover:text-text",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<V extends string>({ value, onChange, tabs }: { value: V; onChange: (value: V) => void; tabs: { value: V; label: ReactNode; icon?: ReactNode; badge?: ReactNode }[] }) {
  return (
    <div role="tablist" className="no-scrollbar flex gap-5 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cx(
            "-mb-px flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-sm font-medium transition",
            value === tab.value ? "border-ink text-text" : "border-transparent text-muted hover:text-text",
          )}
        >
          {tab.icon}
          {tab.label}
          {tab.badge}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        className={cx("animate-fade-up safe-bottom max-h-[92dvh] w-full overflow-y-auto rounded-t-[18px] bg-surface p-5 shadow-xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton label="close" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A section that opens on tap: keeps rarely used options out of the way. */
export function Disclosure({ title, children, defaultOpen = false, className }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full cursor-pointer items-center justify-between gap-3 py-2 text-start text-sm font-medium text-muted hover:text-text">
        {title}
        <ChevronDown className={cx("size-4 transition", open && "rotate-180")} />
      </button>
      {open && <div className="animate-fade-up pt-2">{children}</div>}
    </div>
  );
}

/** A grouped list (settings style): rows with dividers in one bordered box. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface", className)}>{children}</div>;
}

/** A row in a List that leads somewhere: icon, title, one line below, chevron. */
export function ListLink({ href, icon, title, sub, onClick, active }: { href: string; icon?: ReactNode; title: ReactNode; sub?: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <a href={href} onClick={onClick} className={cx("flex items-center gap-3.5 px-4 py-3.5 transition hover:bg-surface-2", active ? "bg-surface-2" : "bg-surface")}>
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        {sub && <span className="block text-[13px] leading-snug text-muted">{sub}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-faint rtl:rotate-180" />
    </a>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-muted", className)} />;
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full border border-line bg-surface text-muted">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {text && <p className="mt-1.5 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
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
      <div className={cx("mt-1 truncate text-xl font-semibold tracking-tight", color)}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-faint">{sub}</div>}
    </div>
  );
}

export function Note({ children, tone = "neutral", icon }: { children: ReactNode; tone?: Tone; icon?: ReactNode }) {
  return (
    <div className={cx("flex gap-2.5 rounded-[10px] border px-3.5 py-3 text-sm", tones[tone])}>
      <span className="mt-0.5 shrink-0">{icon ?? <Info className="size-4" />}</span>
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse-soft rounded-[10px] bg-surface-2", className)} />;
}

export function Row({ label, value, strong, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: Tone }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "";
  return (
    <div className={cx("flex items-baseline justify-between gap-4 py-1.5 text-sm", strong && "border-t border-line pt-2.5 font-semibold")}>
      <span className="text-muted">{label}</span>
      <span className={cx("num text-end", color)}>{value}</span>
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
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((toast) => (
          <div key={toast.id} className="animate-fade-up pointer-events-auto flex items-center gap-2 rounded-[10px] bg-ink px-4 py-3 text-sm font-medium text-on-ink shadow-lg">
            {toast.tone === "good" && <Check className="size-4 text-good" />}
            {toast.tone === "bad" && <X className="size-4 text-bad" />}
            {toast.text}
          </div>
        ))}
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
