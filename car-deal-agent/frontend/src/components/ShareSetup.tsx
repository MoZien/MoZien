import { Share } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { enableSharing, sharingPermission } from "../lib/share";
import { Button, Card } from "./ui";

/** iPhone app: shows once how to share ads into AutoHalle and asks for the notification permission it needs. */
export function ShareSetup() {
  const t = useT();
  const [state, setState] = useState<"hidden" | "ask" | "done">("hidden");
  useEffect(() => {
    void sharingPermission().then((permission) => setState(permission === "prompt" || permission === "prompt-with-rationale" ? "ask" : "hidden"));
  }, []);
  if (state === "hidden") return null;
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className="mt-0.5 shrink-0 text-muted">
        <Share className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{t("share_title")}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t(state === "done" ? "share_done" : "share_text")}</p>
        {state === "ask" && (
          <Button size="sm" variant="primary" className="mt-3" onClick={async () => setState((await enableSharing()) ? "done" : "hidden")}>
            {t("share_enable")}
          </Button>
        )}
      </div>
    </Card>
  );
}
