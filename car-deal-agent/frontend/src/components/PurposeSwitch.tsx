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
        { value: "personal", label: t("purpose_personal_short") },
        { value: "trade", label: t("purpose_trade_short") },
      ]}
    />
  );
}

/** The purpose as a full-width switch with one line on what the answer will cover. */
export function PurposePicker({ value, onChange }: { value: Purpose; onChange: (p: Purpose) => void }) {
  const t = useT();
  return (
    <div>
      <div className="mb-2 text-[13px] font-medium text-muted">{t("purpose_question")}</div>
      <Segmented
        className="w-full"
        value={value}
        onChange={onChange}
        options={[
          { value: "personal", label: t("purpose_personal") },
          { value: "trade", label: t("purpose_trade") },
        ]}
      />
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{t(value === "personal" ? "purpose_personal_hint" : "purpose_trade_hint")}</p>
    </div>
  );
}
