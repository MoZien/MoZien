import { Check, Circle, Loader2, X } from "lucide-react";
import { type TextKey, useT } from "../lib/i18n";
import type { Job } from "../lib/types";
import { Button, Card, Note, cx } from "./ui";

/** Live steps of a running job (read ad, comparables, AI ...), with queue position and pages read. */
export function JobProgress({ job, onCancel, extra }: { job: Job | null; onCancel?: () => void; extra?: React.ReactNode }) {
  const t = useT();
  if (!job) return null;
  const pages = (job.progress.pages ?? 0) + (job.progress.searches ?? 0);
  return (
    <Card className="animate-fade-up p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          {job.steps.map((step) => (
            <div key={step.key} className="flex items-center gap-3 text-sm">
              <span
                className={cx(
                  "grid size-7 shrink-0 place-items-center rounded-full",
                  step.state === "done" && "bg-good/15 text-good",
                  step.state === "active" && "bg-surface-2 text-text",
                  step.state === "failed" && "bg-bad/15 text-bad",
                  (step.state === "pending" || step.state === "skipped") && "bg-surface-2 text-faint",
                )}
              >
                {step.state === "done" ? <Check className="size-4" /> : step.state === "active" ? <Loader2 className="size-4 animate-spin" /> : step.state === "failed" ? <X className="size-4" /> : <Circle className="size-3" />}
              </span>
              <span className={cx("font-medium", step.state === "pending" && "text-faint")}>{t(`step_${step.key}` as TextKey)}</span>
              {typeof step.comparables === "number" && <span className="num text-xs text-muted">· {step.comparables}</span>}
            </div>
          ))}
        </div>
        {onCancel && (job.status === "queued" || job.status === "running") && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {job.queue_position != null && job.queue_position > 0 && <span>{t("queue", { n: job.queue_position })}</span>}
        {pages > 0 && <span className="num">{t("requests_done", { n: pages })}</span>}
      </div>
      {extra}
      <div className="mt-4">
        <Note>{t("takes_time")}</Note>
      </div>
    </Card>
  );
}
