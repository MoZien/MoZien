import { ChevronDown, CircleHelp } from "lucide-react";
import { useState } from "react";
import { Card, cx } from "../components/ui";
import { type TextKey, useT } from "../lib/i18n";

const STEPS = [1, 2, 3, 4, 5] as const;
const FAQ = [1, 2, 3, 4, 5] as const;

export function HelpPage() {
  const t = useT();
  const [open, setOpen] = useState<number | null>(1);
  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2.5 text-xl font-bold sm:text-2xl">
        <CircleHelp className="size-6 text-accent" /> {t("help_title")}
      </h1>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
