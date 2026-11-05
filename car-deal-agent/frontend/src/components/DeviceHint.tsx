import { Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "../lib/app";
import { deviceKind, onDeviceChange } from "../lib/device";
import { useT } from "../lib/i18n";
import { href } from "../lib/router";
import { Note } from "./ui";

/** True when the server loads no marketplace pages and this browser can't either (no app, no helper). */
export function useNeedsDevice(): boolean {
  const { meta } = useApp();
  const [kind, setKind] = useState(deviceKind());
  useEffect(() => {
    setKind(deviceKind()); // the helper may have said hello before this mounted
    return onDeviceChange(() => setKind(deviceKind()));
  }, []);
  return meta?.fetch_mode === "device" && kind === null;
}

/** Explains why checking needs the app or the browser helper, and where to get them. */
export function DeviceHint() {
  const t = useT();
  if (!useNeedsDevice()) return null;
  return (
    <Note tone="warn" icon={<Smartphone className="size-4" />}>
      <p className="font-semibold">{t("device_needed_title")}</p>
      <p className="mt-1">{t("device_needed_text")}</p>
      <a href={href("help")} className="mt-2 inline-block font-semibold text-accent underline-offset-4 hover:underline">
        {t("device_needed_link")}
      </a>
    </Note>
  );
}
