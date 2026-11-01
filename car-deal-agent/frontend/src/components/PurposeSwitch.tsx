import { BadgeEuro, Home } from "lucide-react";
import { useT } from "../lib/i18n";
import { prefsStore, useStore } from "../lib/store";
import type { Purpose } from "../lib/types";
import { Segmented, cx } from "./ui";

/** Buying to keep or to resell: decides the numbers, the verdict and the AI review. */
export function PurposeSwitch({ compact, tiny, value, onChange }: { compact?: boolean; tiny?: boolean; value?: Purpose; onChange?: (p: Purpose) => void }) {
  const t = useT();
  const prefs = useStore(prefsStore);
  const current = value ?? prefs.purpose;
  const set = onChange ?? ((purpose: Purpose) => prefsStore.set((p) => ({ ...p, purpose })));
  return (
    <Segmented
      size={tiny ? "sm" : "md"}
      className={cx(compact ? "w-full" : "")}
      value={current}
      onChange={set}
      options={[
        { value: "personal", label: t(compact ? "purpose_personal_short" : "purpose_personal"), icon: <Home className="size-3.5" /> },
        { value: "trade", label: t(compact ? "purpose_trade_short" : "purpose_trade"), icon: <BadgeEuro className="size-3.5" /> },
      ]}
    />
  );
}

/** The two purposes as big cards with what each answers. */
export function PurposeCards({ value, onChange }: { value: Purpose; onChange: (p: Purpose) => void }) {
  const t = useT();
  const items: { value: Purpose; icon: React.ReactNode; title: string; hint: string }[] = [
    { value: "personal", icon: <Home className="size-5" />, title: t("purpose_personal"), hint: t("purpose_personal_hint") },
    { value: "trade", icon: <BadgeEuro className="size-5" />, title: t("purpose_trade"), hint: t("purpose_trade_hint") },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          aria-pressed={value === item.value}
          className={cx(
            "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-start transition",
            value === item.value ? "border-accent bg-accent/8 ring-4 ring-accent/10" : "border-line bg-surface-2/50 hover:border-accent/40",
          )}
        >
          <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", value === item.value ? "bg-accent text-white" : "bg-surface text-muted")}>{item.icon}</span>
          <span>
            <span className="block text-sm font-semibold">{item.title}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">{item.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
