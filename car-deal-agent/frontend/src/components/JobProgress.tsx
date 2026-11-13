import { Check, Smartphone, X } from "lucide-react";
import { motion } from "motion/react";
import { useAiMarket } from "../lib/app";
import { type TextKey, useT } from "../lib/i18n";
import type { Job } from "../lib/types";
import { CarScan } from "./brand";
import { EASE } from "./motion";
import { Button, Card, ProgressLine, cx } from "./ui";

/** A running job: a car under the scanner, a progress line and the steps (read the ad,
 *  comparables, photos, AI …) as a timeline. */
export function JobProgress({ job, onCancel, extra }: { job: Job | null; onCancel?: () => void; extra?: React.ReactNode }) {
  const t = useT();
  const aiMarket = useAiMarket();
  if (!job) return null;
  const pages = (job.progress.pages ?? 0) + (job.progress.searches ?? 0);
  const steps = job.steps.filter((step) => step.state !== "skipped");
  const done = steps.filter((step) => step.state === "done").length;
  const active = steps.some((step) => step.state === "active") ? 0.5 : 0;
  const share = steps.length ? Math.min(0.96, Math.max(0.06, (done + active) / steps.length)) : 0.06;
  return (
    <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.4, ease: EASE }}>
      <Card className="overflow-hidden">
        <div className="bg-brand-soft relative px-5 pb-4 pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="eyebrow">{t("progress_eyebrow")}</div>
              <div className="mt-0.5 text-[17px] font-semibold">{t("analyzing")}</div>
            </div>
            {onCancel && (job.status === "queued" || job.status === "running") && (
              <Button size="sm" variant="secondary" onClick={onCancel}>
                {t("cancel")}
              </Button>
            )}
          </div>
          <CarScan className="mx-auto mt-3 w-full max-w-[300px]" />
          <ProgressLine value={share} live className="mt-3 bg-surface/70" />
        </div>
        <div className="p-5">
          <ol className="relative space-y-4">
            {steps.map((step, index) => (
              <li key={step.key} className="relative flex items-center gap-3.5 text-sm">
                {index < steps.length - 1 && <span className={cx("absolute start-[11px] top-7 h-[calc(100%-0.5rem)] w-0.5 rounded-full transition-colors duration-500", step.state === "done" ? "bg-accent/50" : "bg-line")} />}
                <span
                  className={cx(
                    "relative grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-300",
                    step.state === "done" && "bg-brand text-white shadow-glow",
                    step.state === "active" && "bg-accent/12",
                    step.state === "failed" && "bg-bad text-white",
                    step.state === "pending" && "border-2 border-line-strong",
                  )}
                >
                  {step.state === "done" && <Check className="animate-pop size-3.5" strokeWidth={3.2} />}
                  {step.state === "failed" && <X className="size-3.5" strokeWidth={3.2} />}
                  {step.state === "active" && (
                    <>
                      <span className="absolute inset-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                      <span className="size-1.5 rounded-full bg-accent" />
                    </>
                  )}
                </span>
                <span className={cx("flex-1 transition-colors", step.state === "pending" ? "text-faint" : "text-text", step.state === "active" && "font-semibold")}>{t((aiMarket && step.key === "market" ? "step_market_ai" : `step_${step.key}`) as TextKey)}</span>
                {typeof step.comparables === "number" && step.comparables > 0 && <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">{step.comparables}</span>}
                {typeof step.count === "number" && step.key === "photos" && <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">{step.count}</span>}
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3.5 text-[13px] leading-relaxed text-muted">
            {job.queue_position != null && job.queue_position > 0 && <span className="font-medium text-warn">{t("queue", { n: job.queue_position })}</span>}
            {pages > 0 && <span className="num">{t("requests_done", { n: pages })}</span>}
            {job.device ? (
              <span className="flex items-center gap-1.5">
                <Smartphone className="size-3.5" /> {t("device_loading")}
              </span>
            ) : (
              <span>{t(aiMarket ? "takes_time_ai" : "takes_time")}</span>
            )}
          </div>
          {extra}
        </div>
      </Card>
    </motion.div>
  );
}
