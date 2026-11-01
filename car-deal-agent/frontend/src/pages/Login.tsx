import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Logo } from "../App";
import { Button, Card, Field, Input, Note, Segmented } from "../components/ui";
import { ApiError, login } from "../lib/api";
import { useApp } from "../lib/app";
import { useT } from "../lib/i18n";
import { prefsStore } from "../lib/store";
import type { Lang } from "../lib/types";

export function LoginPage() {
  const t = useT();
  const { refresh, meta } = useApp();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Card className="animate-fade-up w-full max-w-sm p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-semibold">{meta?.app_name ?? "AutoHalle"}</span>
          </div>
          <Segmented size="sm" value={t.lang} onChange={(language: Lang) => prefsStore.set((p) => ({ ...p, language }))} options={[{ value: "ar", label: "ع" }, { value: "de", label: "DE" }, { value: "en", label: "EN" }]} />
        </div>
        <h1 className="text-xl font-semibold">{t("login_title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("login_sub")}</p>
        <form
          className="mt-5 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await login(code);
              await refresh();
            } catch (err) {
              setError(err instanceof ApiError && err.code === "bad_code" ? t("bad_code") : t("err_offline"));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={t("access_code")}>
            <Input value={code} onChange={(e) => setCode(e.target.value)} type="password" autoComplete="current-password" autoFocus required />
          </Field>
          {error && <Note tone="bad">{error}</Note>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} icon={<KeyRound className="size-4" />}>
            {t("login")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
