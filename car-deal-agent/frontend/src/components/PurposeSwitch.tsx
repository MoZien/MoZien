import { BadgeEuro, CarFront, Check } from "lucide-react";
import { useT } from "../lib/i18n";
import { prefsStore, useStore } from "../lib/store";
import type { Purpose } from "../lib/types";
import { IconTile, Segmented, cx } from "./ui";

/** Buying to keep or to resell: decides the numbers, the verdict and the AI review. */
export function PurposeSwitch({ compact, tiny, value, onChange, onDark }: { compact?: boolean; tiny?: boolean; value?: Purpose; onChange?: (p: Purpose) => void; onDark?: boolean }) {
  const t = useT();
  const prefs = useStore(prefsStore);
  const current = value ?? prefs.purpose;
  const set = onChange ?? ((purpose: Purpose) => prefsStore.set((p) => ({ ...p, purpose })));
  return (
    <Segmented
      size={tiny ? "sm" : "md"}
      className={cx(compact ? "w-full" : "")}
      onDark={onDark}
      value={current}
      onChange={set}
      options={[
        { value: "personal", label: t("purpose_personal_short"), icon: tiny ? undefined : <CarFront className="size-4" /> },
        { value: "trade", label: t("purpose_trade_short"), icon: tiny ? undefined : <BadgeEuro className="size-4" /> },
      ]}
    />
  );
}

/** The purpose as two cards to choose from, each with one line on what the answer will cover. */
export function PurposePicker({ value, onChange }: { value: Purpose; onChange: (p: Purpose) => void }) {
  const t = useT();
  const options = [
    { value: "personal" as const, title: t("purpose_personal"), hint: t("purpose_personal_hint"), icon: <CarFront className="size-5" />, hue: "accent" as const },
    { value: "trade" as const, title: t("purpose_trade"), hint: t("purpose_trade_hint"), icon: <BadgeEuro className="size-5" />, hue: "good" as const },
  ];
  return (
    <div>
      <div className="mb-2 text-[13px] font-medium text-muted">{t("purpose_question")}</div>
      <div role="radiogroup" className="grid grid-cols-2 gap-2.5">
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
                "relative flex cursor-pointer flex-col gap-2.5 rounded-2xl border p-3.5 text-start transition duration-200 active:scale-[0.97]",
                active ? "border-accent bg-accent/8 ring-4 ring-accent/12" : "border-line bg-surface hover:bg-surface-2",
              )}
            >
              <IconTile hue={option.hue}>{option.icon}</IconTile>
              <span>
                <span className="block text-[15px] font-semibold leading-tight">{option.title}</span>
                <span className="mt-1 block text-xs leading-snug text-muted">{option.hint}</span>
              </span>
              {active && (
                <span className="bg-brand animate-pop absolute end-3 top-3 grid size-5 place-items-center rounded-full text-white">
                  <Check className="size-3" strokeWidth={3.2} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
