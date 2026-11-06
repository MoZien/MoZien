import { Check, Smartphone, X } from "lucide-react";
import { type TextKey, useT } from "../lib/i18n";
import type { Job } from "../lib/types";
import { Button, Card, cx } from "./ui";

/** A running job: a thin progress line and the steps (read ad, comparables, photos, AI …). */
export function JobProgress({ job, onCancel, extra }: { job: Job | null; onCancel?: () => void; extra?: React.ReactNode }) {
  const t = useT();
  if (!job) return null;
  const pages = (job.progress.pages ?? 0) + (job.progress.searches ?? 0);
  const steps = job.steps.filter((step) => step.state !== "skipped");
  const done = steps.filter((step) => step.state === "done").length;
  const active = steps.some((step) => step.state === "active") ? 0.5 : 0;
  const share = steps.length ? Math.min(0.96, Math.max(0.06, (done + active) / steps.length)) : 0.06;
  return (
    <Card className="animate-fade-up overflow-hidden">
      <div className="h-0.5 bg-surface-2" dir="ltr">
        <div className="h-full bg-accent transition-all duration-700" style={{ width: `${share * 100}%` }} />
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[15px] font-semibold">{t("analyzing")}</div>
          {onCancel && (job.status === "queued" || job.status === "running") && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {t("cancel")}
            </Button>
          )}
        </div>

        <ol className="mt-4 space-y-3">
          {steps.map((step) => (
            <li key={step.key} className="flex items-center gap-3 text-sm">
              <span
                className={cx(
                  "grid size-5 shrink-0 place-items-center rounded-full",
                  step.state === "done" && "bg-ink text-on-ink",
                  step.state === "active" && "border-2 border-accent border-t-transparent animate-spin",
                  step.state === "failed" && "bg-bad text-white",
                  step.state === "pending" && "border border-line-strong",
                )}
              >
                {step.state === "done" ? <Check className="size-3" strokeWidth={3} /> : step.state === "failed" ? <X className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className={cx("flex-1", step.state === "pending" ? "text-faint" : "text-text", step.state === "active" && "font-medium")}>{t(`step_${step.key}` as TextKey)}</span>
              {typeof step.comparables === "number" && <span className="num text-[13px] text-muted">{step.comparables}</span>}
              {typeof step.count === "number" && step.key === "photos" && <span className="num text-[13px] text-muted">{step.count}</span>}
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[13px] text-muted">
          {job.queue_position != null && job.queue_position > 0 && <span className="font-medium text-warn">{t("queue", { n: job.queue_position })}</span>}
          {pages > 0 && <span className="num">{t("requests_done", { n: pages })}</span>}
          {job.device ? (
            <span className="flex items-center gap-1.5">
              <Smartphone className="size-3.5" /> {t("device_loading")}
            </span>
          ) : (
            <span>{t("takes_time")}</span>
          )}
        </div>
        {extra}
      </div>
    </Card>
  );
}
