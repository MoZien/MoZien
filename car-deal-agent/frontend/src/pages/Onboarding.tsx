import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { CarScan } from "../components/brand";
import { PurposePicker } from "../components/PurposeSwitch";
import { Button, Field, Modal, Segmented } from "../components/ui";
import { useApp } from "../lib/app";
import { useT } from "../lib/i18n";
import { prefsStore, uiStore, useStore } from "../lib/store";
import type { Lang } from "../lib/types";
import { ZipInput } from "./Settings";

/** First start: a welcome, then language, purpose and home postal code. */
export function Onboarding() {
  const t = useT();
  const { meta } = useApp();
  const prefs = useStore(prefsStore);
  const [open, setOpen] = useState(true);
  const done = () => {
    uiStore.set((ui) => ({ ...ui, onboarded: true }));
    setOpen(false);
  };
  return (
    <Modal
      open={open}
      onClose={done}
      title={t("welcome_title", { app: meta?.app_name ?? "AutoHalle" })}
      sub={t("welcome_line")}
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={done} icon={<ArrowRight className="size-[18px] rtl:rotate-180" />}>
          {t("welcome_go")}
        </Button>
      }
    >
      <div className="space-y-5 pt-1">
        <div className="hero rounded-[22px] px-5 py-4">
          <span className="hero-grid" />
          <CarScan onDark className="mx-auto w-full max-w-[260px]" />
        </div>
        <Segmented
          className="w-full"
          value={prefs.language}
          onChange={(language: Lang) => prefsStore.set((p) => ({ ...p, language }))}
          options={[{ value: "ar", label: "العربية" }, { value: "de", label: "Deutsch" }, { value: "en", label: "English" }]}
        />
        <PurposePicker value={prefs.purpose} onChange={(purpose) => prefsStore.set((p) => ({ ...p, purpose }))} />
        <Field label={t("welcome_zip")} hint={t("home_zip_hint")}>
          <ZipInput value={prefs.home_zip} onChange={(home_zip) => prefsStore.set((p) => ({ ...p, home_zip }))} />
        </Field>
      </div>
    </Modal>
  );
}
