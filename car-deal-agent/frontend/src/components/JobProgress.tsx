import { Check, Circle, Loader2, X } from "lucide-react";
import { type TextKey, useT } from "../lib/i18n";
import type { Job } from "../lib/types";
import { Button, Card, cx } from "./ui";

/** A running job: a car drives along the road as the steps get done (read ad, comparables, AI …). */
export function JobProgress({ job, onCancel, extra }: { job: Job | null; onCancel?: () => void; extra?: React.ReactNode }) {
  const t = useT();
  if (!job) return null;
  const pages = (job.progress.pages ?? 0) + (job.progress.searches ?? 0);
  const steps = job.steps.filter((step) => step.state !== "skipped");
  const done = steps.filter((step) => step.state === "done").length;
  const active = steps.some((step) => step.state === "active") ? 0.5 : 0;
  const share = steps.length ? Math.min(0.96, Math.max(0.06, (done + active) / steps.length)) : 0.06;
  return (
    <Card className="animate-fade-up overflow-hidden p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="text-[15px] font-semibold">{t("analyzing")}</div>
        {onCancel && (job.status === "queued" || job.status === "running") && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
      </div>

      {/* The road: dashed centre line, the part already driven in the brand colour, and the car. */}
      <div className="relative mt-4 h-10" dir="ltr">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-surface-2" />
        <div className="road-lines absolute inset-x-2 top-1/2 h-px -translate-y-1/2 opacity-60" />
        <div className="absolute start-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-accent transition-all duration-700" style={{ width: `${share * 100}%` }} />
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-700" style={{ left: `${share * 100}%` }}>
          <span className="drive grid size-10 place-items-center rounded-full bg-accent text-on-accent shadow-lg shadow-accent/40">
            <svg viewBox="0 0 512 512" className="size-6" fill="none" stroke="currentColor" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M126 292 L156 212 Q165 190 190 190 H322 Q347 190 356 212 L386 292" />
              <path d="M112 292 H400 Q414 292 414 306 V344 Q414 358 400 358 H112 Q98 358 98 344 V306 Q98 292 112 292 Z" />
              <path d="M150 358 V386 M362 358 V386" />
            </svg>
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {steps.map((step) => (
          <div key={step.key} className="flex items-center gap-3 text-sm">
            <span
              className={cx(
                "grid size-7 shrink-0 place-items-center rounded-full transition",
                step.state === "done" && "bg-good text-white",
                step.state === "active" && "bg-accent/15 text-accent",
                step.state === "failed" && "bg-bad/15 text-bad",
                step.state === "pending" && "bg-surface-2 text-faint",
              )}
            >
              {step.state === "done" ? <Check className="size-4" /> : step.state === "active" ? <Loader2 className="size-4 animate-spin" /> : step.state === "failed" ? <X className="size-4" /> : <Circle className="size-2.5" />}
            </span>
            <span className={cx(step.state === "pending" ? "text-faint" : "font-medium", step.state === "active" && "text-accent")}>{t(`step_${step.key}` as TextKey)}</span>
            {typeof step.comparables === "number" && <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{step.comparables}</span>}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {job.queue_position != null && job.queue_position > 0 && <span className="rounded-full bg-warn/15 px-2.5 py-1 font-medium text-warn">{t("queue", { n: job.queue_position })}</span>}
        {pages > 0 && <span className="num">{t("requests_done", { n: pages })}</span>}
        <span>{t("takes_time")}</span>
      </div>
      {extra}
    </Card>
  );
}
