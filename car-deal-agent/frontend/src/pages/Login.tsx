import { useEffect, useRef, useState } from "react";
import { Logo } from "../App";
import { Button, Card, Field, Input, Note, Segmented } from "../components/ui";
import { ApiError, api, login } from "../lib/api";
import { useApp } from "../lib/app";
import { type TextKey, useT } from "../lib/i18n";
import { href, navigate, useRoute } from "../lib/router";
import { prefsStore } from "../lib/store";
import type { Lang } from "../lib/types";

type Step = "email" | "code" | "access";
const LAST_EMAIL = "ah.lastEmail";

/** Sign-in: email address → six-digit code from the email (or its one-tap link); access codes as a second way. */
export function LoginPage() {
  const t = useT();
  const { refresh, meta } = useApp();
  const route = useRoute();
  const methods = meta?.login ?? ["code"];
  const [step, setStep] = useState<Step>(methods.includes("email") ? "email" : "access");
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(LAST_EMAIL) ?? "";
    } catch {
      return "";
    }
  });
  const [code, setCode] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const linkTried = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // The link in the email: #/login?email=…&code=…
  useEffect(() => {
    const fromLink = route.query.get("email");
    const codeFromLink = route.query.get("code");
    if (route.page === "login" && fromLink && codeFromLink && !linkTried.current && methods.includes("email")) {
      linkTried.current = true;
      setEmail(fromLink);
      setCode(codeFromLink);
      setStep("code");
      verify(fromLink, codeFromLink);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, methods.join()]);

  function explain(err: unknown) {
    if (!(err instanceof ApiError)) return t("err_offline");
    const d = err.details as { seconds?: number; left?: number };
    const key = `err_${err.code}` as TextKey;
    return t(key, { seconds: d.seconds ?? "", left: d.left ?? "", km: "", message: "" });
  }

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const sent = await api<{ email: string }>("/api/auth/email/start", { body: { email, language: t.lang } });
      setEmail(sent.email);
      try {
        localStorage.setItem(LAST_EMAIL, sent.email);
      } catch {
        /* private mode */
      }
      setCode("");
      setStep("code");
      setCooldown(45);
    } catch (err) {
      setError(explain(err));
      if (err instanceof ApiError && err.code === "too_soon") {
        setStep("code");
        setCooldown(Number((err.details as { seconds?: number }).seconds) || 45);
      }
    } finally {
      setBusy(false);
    }
  }

  async function verify(address = email, value = code) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/email/verify", { body: { email: address, code: value } });
      navigate("analyze");
      await refresh();
    } catch (err) {
      setError(explain(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function withAccessCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(accessCode);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.code === "bad_code" ? t("bad_code") : t("err_offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="safe-top flex min-h-dvh flex-col items-center justify-center p-4">
      <Card className="login-card animate-fade-up w-full max-w-sm p-6">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <Segmented size="sm" value={t.lang} onChange={(language: Lang) => prefsStore.set((p) => ({ ...p, language }))} options={[{ value: "ar", label: "ع" }, { value: "de", label: "DE" }, { value: "en", label: "EN" }]} />
        </div>

        {step === "email" && (
          <form className="space-y-4" onSubmit={sendCode}>
            <div>
              <h1 className="text-xl font-semibold">{t("login_email_title")}</h1>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t("login_email_sub")}</p>
            </div>
            <Field label={t("email_label")}>
              <Input type="email" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" autoFocus required />
            </Field>
            {error && <Note tone="bad">{error}</Note>}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
              {t("send_code")}
            </Button>
          </form>
        )}

        {step === "code" && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              verify();
            }}
          >
            <div>
              <h1 className="text-xl font-semibold">{t("code_title")}</h1>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t("code_sent", { email })}</p>
            </div>
            <Field label={t("code_label")}>
              <Input
                value={code}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(digits);
                  if (digits.length === 6 && !busy) verify(email, digits);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                placeholder="••••••"
                className="otp text-center text-2xl tracking-[0.4em]"
                autoFocus
              />
            </Field>
            {error && <Note tone="bad">{error}</Note>}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>
              {t("confirm")}
            </Button>
            <div className="flex items-center justify-between gap-3 text-sm">
              <button type="button" className="cursor-pointer text-muted hover:text-text" onClick={() => { setStep("email"); setError(null); }}>
                {t("other_email")}
              </button>
              <button type="button" className="cursor-pointer text-muted hover:text-text disabled:cursor-default disabled:opacity-50" disabled={cooldown > 0 || busy} onClick={() => sendCode()}>
                {cooldown > 0 ? t("resend_in", { s: cooldown }) : t("resend")}
              </button>
            </div>
          </form>
        )}

        {step === "access" && (
          <form className="space-y-4" onSubmit={withAccessCode}>
            <div>
              <h1 className="text-xl font-semibold">{t("login_title")}</h1>
              <p className="mt-1 text-sm text-muted">{t("login_sub")}</p>
            </div>
            <Field label={t("access_code")}>
              <Input value={accessCode} onChange={(e) => setAccessCode(e.target.value)} type="password" autoComplete="current-password" autoFocus required />
            </Field>
            {error && <Note tone="bad">{error}</Note>}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
              {t("login")}
            </Button>
          </form>
        )}

        {methods.length > 1 && (
          <button
            type="button"
            className="mt-5 w-full cursor-pointer border-t border-line pt-4 text-center text-sm text-muted hover:text-text"
            onClick={() => {
              setStep(step === "access" ? "email" : "access");
              setError(null);
            }}
          >
            {step === "access" ? t("use_email") : t("use_access_code")}
          </button>
        )}
      </Card>
      <footer className="mt-4 w-full max-w-sm space-y-2 text-center text-xs leading-relaxed text-faint">
        <p>{t("login_legal_note")}</p>
        <nav className="flex justify-center gap-4">
          {(["impressum", "datenschutz", "nutzungsbedingungen"] as const).map((page) => (
            <a key={page} href={href(page)} className="text-muted underline-offset-4 hover:text-text hover:underline">
              {t(({ impressum: "legal_imprint", datenschutz: "legal_privacy", nutzungsbedingungen: "legal_terms" } as const)[page])}
            </a>
          ))}
        </nav>
      </footer>
    </div>
  );
}
