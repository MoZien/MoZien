import { Calculator, CheckCircle2, CircleHelp, Download, FileText, Puzzle, Scale, Sparkles, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { Reveal, Stagger, StaggerItem } from "../components/motion";
import { Card, Fold, type Hue, IconTile, PageTitle } from "../components/ui";
import { API_BASE } from "../lib/api";
import { useAiMarket } from "../lib/app";
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
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-3.5">
        <IconTile hue="violet">
          <Puzzle className="size-5" strokeWidth={1.75} />
        </IconTile>
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
                className="bg-brand mt-4 inline-flex h-11 items-center gap-2 rounded-[14px] px-4 text-sm font-medium text-white shadow-glow transition hover:brightness-110 active:scale-[0.97]"
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

const STEPS: { n: 1 | 2 | 3 | 4 | 5; icon: React.ReactNode; hue: Hue }[] = [
  { n: 1, icon: <FileText className="size-5" />, hue: "accent" },
  { n: 2, icon: <Scale className="size-5" />, hue: "cyan" },
  { n: 3, icon: <Calculator className="size-5" />, hue: "violet" },
  { n: 4, icon: <Target className="size-5" />, hue: "good" },
  { n: 5, icon: <Sparkles className="size-5" />, hue: "warn" },
];
const FAQ = [1, 2, 3, 4, 5] as const;

export function HelpPage() {
  const t = useT();
  const aiMarket = useAiMarket();
  // With the AI estimate, steps 2 and 3 and two answers read differently.
  const k = (key: string) => (aiMarket && ["help_2_t", "help_2", "help_3_t", "help_3", "faq_2_a", "faq_4_a"].includes(key) ? `${key}_ai` : key) as TextKey;
  return (
    <div className="space-y-5 lg:space-y-6">
      <PageTitle icon={<CircleHelp className="size-6" />} title={t("help_title")} sub={t("nav_help_sub")} />
      <Reveal delay={0.05}>
        <HelperCard />
      </Reveal>
      <Stagger className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4 xl:grid-cols-3" delay={0.08}>
        {STEPS.map(({ n, icon, hue }) => (
          <StaggerItem key={n}>
            <Card className="relative h-full overflow-hidden p-4 sm:p-5">
              <span className="num pointer-events-none absolute -top-3 end-3 text-[76px] font-bold leading-none text-surface-2">{n}</span>
              <IconTile hue={hue}>{icon}</IconTile>
              <h3 className="relative mt-3 text-[15px] font-semibold">{t(k(`help_${n}_t`)).replace(/^\d+\.\s*/, "")}</h3>
              <p className="relative mt-1.5 text-sm leading-relaxed text-muted">{t(k(`help_${n}`))}</p>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>
      <section>
        <h2 className="mb-3 text-[17px] font-semibold">{t("faq")}</h2>
        <Stagger className="space-y-2.5" delay={0.12}>
          {FAQ.map((n) => (
            <StaggerItem key={n}>
              <Fold title={t(`faq_${n}_q` as TextKey)} defaultOpen={n === 1}>
                <p className="text-sm leading-relaxed text-muted">{t(k(`faq_${n}_a`))}</p>
              </Fold>
            </StaggerItem>
          ))}
        </Stagger>
      </section>
      <p className="text-xs leading-relaxed text-faint">{t("disclaimer")}</p>
    </div>
  );
}
