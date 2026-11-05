import { CheckCircle2, ChevronDown, Download, Puzzle } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, cx } from "../components/ui";
import { API_BASE } from "../lib/api";
import { deviceKind, onDeviceChange } from "../lib/device";
import { type TextKey, useT } from "../lib/i18n";

/** The AutoHalle helper for desktop browsers: what it does, whether it is active, how to install it. */
function HelperCard() {
  const t = useT();
  const [kind, setKind] = useState(deviceKind());
  useEffect(() => {
    setKind(deviceKind()); // the helper may have said hello between the first render and now
    return onDeviceChange(() => setKind(deviceKind()));
  }, []);
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
          <Puzzle className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t("helper_title")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t("helper_text")}</p>
          {kind !== "native" && <p className="mt-2 text-sm leading-relaxed text-muted">{t("helper_phone")}</p>}
          {kind ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-good">
              <CheckCircle2 className="size-4" /> {t(kind === "native" ? "helper_native" : "helper_active")}
            </p>
          ) : (
            <>
              <ol className="mt-3 list-decimal space-y-1 ps-5 text-sm leading-relaxed">
                <li>{t("helper_step_1")}</li>
                <li>{t("helper_step_2")}</li>
                <li>{t("helper_step_3")}</li>
              </ol>
              <a
                href={`${API_BASE}/autohalle-helfer.zip`}
                download
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"
              >
                <Download className="size-4" /> {t("helper_download")}
              </a>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

const STEPS = [1, 2, 3, 4, 5] as const;
const FAQ = [1, 2, 3, 4, 5] as const;

export function HelpPage() {
  const t = useT();
  const [open, setOpen] = useState<number | null>(1);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("help_title")}</h1>
      <HelperCard />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {STEPS.map((n) => (
          <Card key={n} className="p-5">
            <h3 className="font-semibold">{t(`help_${n}_t` as TextKey)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t(`help_${n}` as TextKey)}</p>
          </Card>
        ))}
      </div>
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("faq")}</h2>
        <Card className="divide-y divide-line">
          {FAQ.map((n) => (
            <div key={n}>
              <button onClick={() => setOpen(open === n ? null : n)} className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-start text-sm font-medium" aria-expanded={open === n}>
                {t(`faq_${n}_q` as TextKey)}
                <ChevronDown className={cx("size-4 shrink-0 transition", open === n && "rotate-180")} />
              </button>
              {open === n && <p className="animate-fade-up px-5 pb-4 text-sm leading-relaxed text-muted">{t(`faq_${n}_a` as TextKey)}</p>}
            </div>
          ))}
        </Card>
      </section>
      <p className="text-xs text-faint">{t("disclaimer")}</p>
    </div>
  );
}
