import { BadgeEuro, CalendarClock, Car, ChevronDown, FileSearch, Landmark, MessageSquareText, Route as RouteIcon, ShieldAlert, Wrench } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { EASE, Stagger, StaggerItem } from "../components/motion";
import { Badge, Button, Card, Field, type Hue, IconTile, Input, Note, NumberInput, PageTitle, Row, Segmented, Textarea, Toggle, copyText, cx, useToast } from "../components/ui";
import { ApiError, distance, scanText } from "../lib/api";
import { euro, monthsUntil, pct } from "../lib/format";
import { type TextKey, useT } from "../lib/i18n";
import type { Route } from "../lib/router";
import { prefsStore, useStore } from "../lib/store";
import type { TextScan } from "../lib/types";

// One tool open at a time: the page stays a short list of names.
const OpenTool = createContext<{ open: string | null; toggle: (id: string) => void }>({ open: null, toggle: () => {} });

function Tool({ id, title, sub, icon, hue, children }: { id: string; title: string; sub: string; icon: ReactNode; hue: Hue; children: ReactNode }) {
  const { open, toggle } = useContext(OpenTool);
  const isOpen = open === id;
  return (
    <StaggerItem>
      <Card id={`tool-${id}`} className={cx("scroll-mt-24 overflow-hidden transition-shadow duration-300", isOpen && "shadow-pop ring-1 ring-accent/20")}>
        <button type="button" aria-expanded={isOpen} onClick={() => toggle(id)} className="flex w-full cursor-pointer items-center gap-3.5 p-4 text-start transition-colors hover:bg-surface-2/60 sm:px-5">
          <IconTile hue={hue}>{icon}</IconTile>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{title}</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted">{sub}</span>
          </span>
          <ChevronDown className={cx("size-4 shrink-0 text-faint transition-transform duration-300", isOpen && "rotate-180")} />
        </button>
        <motion.div className="fold-body" initial={false} animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }} transition={{ duration: 0.32, ease: EASE }} inert={!isOpen}>
          <div className="border-t border-line p-4 sm:p-5">{children}</div>
        </motion.div>
      </Card>
    </StaggerItem>
  );
}

export function ToolsPage({ route }: { route: Route }) {
  const t = useT();
  const focus = route.query.get("tool");
  const [open, setOpen] = useState<string | null>(focus);
  useEffect(() => {
    if (focus) {
      setOpen(focus);
      document.getElementById(`tool-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focus]);
  return (
    <OpenTool.Provider value={{ open, toggle: (id) => setOpen((current) => (current === id ? null : id)) }}>
      <div className="mx-auto max-w-2xl space-y-5 lg:space-y-6">
        <PageTitle icon={<Wrench className="size-6" />} hue="warn" title={t("tools_title")} sub={t("tools_sub")} />
        <Stagger className="space-y-3" delay={0.05}>
          <ScanTool />
          <ProfitTool />
          <TripTool />
          <RunningTool />
          <LoanTool />
          <TuvTool />
          <MessagesTool />
        </Stagger>
      </div>
    </OpenTool.Provider>
  );
}

function ProfitTool() {
  const t = useT();
  const prefs = useStore(prefsStore);
  const [buy, setBuy] = useState<number | null>(2000);
  const [sell, setSell] = useState<number | null>(3000);
  const [repairs, setRepairs] = useState<number | null>(0);
  const [other, setOther] = useState<number | null>(150);
  const [vat, setVat] = useState(prefs.vat_margin_scheme);
  const margin = (sell ?? 0) - (buy ?? 0);
  const marginVat = vat ? Math.round((Math.max(margin, 0) * 0.19) / 1.19) : 0;
  const costs = (repairs ?? 0) + (other ?? 0) + marginVat;
  const profit = margin - costs;
  const invested = (buy ?? 0) + (repairs ?? 0) + (other ?? 0);
  return (
    <Tool id="profit" title={t("tool_profit")} sub={t("tool_profit_sub")} hue="good" icon={<BadgeEuro className="size-5" />}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("buy")}><NumberInput value={buy} onChange={setBuy} suffix="€" allowEmpty /></Field>
        <Field label={t("resale")}><NumberInput value={sell} onChange={setSell} suffix="€" allowEmpty /></Field>
        <Field label={t("repairs")}><NumberInput value={repairs} onChange={setRepairs} suffix="€" allowEmpty /></Field>
        <Field label={t("costs")}><NumberInput value={other} onChange={setOther} suffix="€" allowEmpty /></Field>
      </div>
      <div className="mt-3"><Toggle checked={vat} onChange={setVat} label={t("s_vat")} /></div>
      <div className="mt-4 rounded-2xl bg-surface-2 px-4 py-2 ring-1 ring-line">
        {vat && <Row label={t("margin_vat")} value={euro(marginVat)} />}
        <Row strong label={t("profit")} value={euro(profit)} tone={profit >= 0 ? "good" : "bad"} />
        <Row label={t("roi")} value={invested ? pct(profit / invested) : "–"} />
      </div>
    </Tool>
  );
}

function TripTool() {
  const t = useT();
  const prefs = useStore(prefsStore);
  const [from, setFrom] = useState(prefs.home_zip);
  const [to, setTo] = useState("");
  const [fuel, setFuel] = useState<"benzin" | "diesel">("benzin");
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const price = fuel === "diesel" ? prefs.diesel_price : prefs.petrol_price;
  const legs = prefs.round_trip ? 2 : 1;
  async function calc() {
    setError(false);
    try {
      setResult((await distance(from, to, prefs.road_factor)).km);
    } catch {
      setResult(null);
      setError(true);
    }
  }
  const cost = result == null ? null : Math.round(result * legs * (prefs.consumption / 100) * price);
  return (
    <Tool id="trip" title={t("tool_trip")} sub={t("tool_trip_sub")} hue="cyan" icon={<RouteIcon className="size-5" />}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("from_zip")}><Input value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, "").slice(0, 5))} className="num" inputMode="numeric" /></Field>
        <Field label={t("to_zip")}><Input value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, "").slice(0, 5))} className="num" inputMode="numeric" placeholder="80331" /></Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Segmented size="sm" value={fuel} onChange={setFuel} options={[{ value: "benzin", label: "Benzin" }, { value: "diesel", label: "Diesel" }]} />
        <Button size="sm" variant="primary" onClick={calc} disabled={from.length !== 5 || to.length !== 5}>{t("calculate")}</Button>
      </div>
      {error && <div className="mt-3"><Note tone="bad">{t("err_bad_input")}</Note></div>}
      {result != null && cost != null && (
        <div className="mt-4 rounded-2xl bg-surface-2 px-4 py-2 ring-1 ring-line">
          <Row label={t("distance")} value={`${legs} × ${result} km`} />
          <Row label={t("consumption")} value={`${prefs.consumption} l/100 km × ${euro(price).replace(" €", "")} €`} />
          <Row strong label={t("costs")} value={euro(cost)} />
        </div>
      )}
    </Tool>
  );
}

function RunningTool() {
  const t = useT();
  const prefs = useStore(prefsStore);
  const [annual, setAnnual] = useState<number | null>(prefs.annual_km);
  const [consumption, setConsumption] = useState<number | null>(6.5);
  const [price, setPrice] = useState<number | null>(prefs.petrol_price);
  const [tax, setTax] = useState<number | null>(120);
  const [insurance, setInsurance] = useState<number | null>(500);
  const [maintenance, setMaintenance] = useState<number | null>(600);
  const fuel = ((annual ?? 0) / 100) * (consumption ?? 0) * (price ?? 0);
  const total = fuel + (tax ?? 0) + (insurance ?? 0) + (maintenance ?? 0);
  return (
    <Tool id="running" title={t("tool_running")} sub={t("tool_running_sub")} hue="violet" icon={<Car className="size-5" />}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={t("s_annual_km")}><NumberInput value={annual} onChange={setAnnual} suffix="km" allowEmpty /></Field>
        <Field label={t("consumption")}><NumberInput value={consumption} onChange={setConsumption} suffix="l" allowEmpty /></Field>
        <Field label={t("s_petrol")}><NumberInput value={price} onChange={setPrice} suffix="€" allowEmpty /></Field>
        <Field label={t("tax_year")}><NumberInput value={tax} onChange={setTax} suffix="€" allowEmpty /></Field>
        <Field label={t("insurance_year")}><NumberInput value={insurance} onChange={setInsurance} suffix="€" allowEmpty /></Field>
        <Field label={t("maintenance_year")}><NumberInput value={maintenance} onChange={setMaintenance} suffix="€" allowEmpty /></Field>
      </div>
      <div className="mt-4 rounded-2xl bg-surface-2 px-4 py-2 ring-1 ring-line">
        <Row label={t("fuel_year")} value={euro(fuel)} />
        <Row strong label={t("per_year")} value={euro(total)} />
        <Row label={t("per_month")} value={euro(total / 12)} tone="accent" />
      </div>
    </Tool>
  );
}

function LoanTool() {
  const t = useT();
  const [price, setPrice] = useState<number | null>(8000);
  const [down, setDown] = useState<number | null>(2000);
  const [rate, setRate] = useState<number | null>(6.9);
  const [months, setMonths] = useState<number | null>(48);
  const principal = Math.max((price ?? 0) - (down ?? 0), 0);
  const r = (rate ?? 0) / 100 / 12;
  const n = Math.max(months ?? 1, 1);
  const monthly = r === 0 ? principal / n : (principal * r) / (1 - (1 + r) ** -n);
  return (
    <Tool id="loan" title={t("tool_loan")} sub={t("tool_loan_sub")} hue="accent" icon={<Landmark className="size-5" />}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("asking_price")}><NumberInput value={price} onChange={setPrice} suffix="€" allowEmpty /></Field>
        <Field label={t("down_payment")}><NumberInput value={down} onChange={setDown} suffix="€" allowEmpty /></Field>
        <Field label={t("interest")}><NumberInput value={rate} onChange={setRate} suffix="%" allowEmpty /></Field>
        <Field label={t("term")}><NumberInput value={months} onChange={setMonths} allowEmpty /></Field>
      </div>
      <div className="mt-4 rounded-2xl bg-surface-2 px-4 py-2 ring-1 ring-line">
        <Row strong label={t("monthly_rate")} value={euro(monthly)} tone="accent" />
        <Row label={t("total_interest")} value={euro(monthly * n - principal)} />
      </div>
    </Tool>
  );
}

function TuvTool() {
  const t = useT();
  const [value, setValue] = useState("");
  const months = monthsUntil(value);
  return (
    <Tool id="tuv" title={t("tool_tuv")} sub={t("tool_tuv_sub")} hue="warn" icon={<CalendarClock className="size-5" />}>
      <Field label={t("hu_until")}><Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="08/2027" className="num" /></Field>
      {months != null && (
        <div className="mt-3">
          <Badge tone={months < 0 ? "bad" : months <= 2 ? "warn" : "good"} className="text-sm">
            {months < 0 ? t("tuv_overdue", { n: -months }) : months === 0 ? t("tuv_this_month") : t("tuv_left", { n: months })}
          </Badge>
        </div>
      )}
    </Tool>
  );
}

function ScanTool() {
  const t = useT();
  const prefs = useStore(prefsStore);
  const [text, setText] = useState("");
  const [result, setResult] = useState<TextScan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await scanText(text, prefs));
    } catch (err) {
      const reason = err instanceof ApiError ? (err.details.reason as string | undefined) : undefined;
      setError(reason ? t(`ai_reason_${reason}` as TextKey) : t(`err_${err instanceof ApiError ? err.code : "server"}` as TextKey, { message: "" }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Tool id="scan" title={t("tool_scan")} sub={t("tool_scan_sub")} hue="accent" icon={<FileSearch className="size-5" />}>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("scan_placeholder")} dir="auto" />
      <Button className="mt-3" variant="primary" loading={busy} disabled={text.trim().length < 20} onClick={run}>{t("scan_run")}</Button>
      {error && <div className="mt-3"><Note tone="bad">{error}</Note></div>}
      {result && (
        <div className="mt-4 space-y-3 text-sm">
          <p className="leading-relaxed">{result.summary}</p>
          <Badge tone={result.scam_risk === "low" ? "good" : result.scam_risk === "medium" ? "warn" : "bad"}>
            <ShieldAlert className="size-3" /> {t("scam")}: {t(`risk_${result.scam_risk}` as TextKey)}
          </Badge>
          {result.issues.length > 0 && (
            <div className="space-y-2">
              {result.issues.map((issue, i) => (
                <div key={i} className="rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
                  <div className="flex justify-between gap-2"><span className="font-medium">{issue.issue}</span><span className="num text-bad">~{euro(issue.cost_eur)}</span></div>
                  <p className="mt-1 text-xs italic text-muted" dir="ltr">“{issue.quote}”</p>
                </div>
              ))}
            </div>
          )}
          {[...result.red_flags, ...result.scam_signals].length > 0 && (
            <div>
              <div className="mb-1 font-semibold">{t("red_flags")}</div>
              <ul className="space-y-1 text-muted">{[...result.red_flags, ...result.scam_signals].map((f, i) => <li key={i}>• {f}</li>)}</ul>
            </div>
          )}
          {result.questions_for_seller.length > 0 && (
            <div>
              <div className="mb-1 font-semibold">{t("questions")}</div>
              <ul className="space-y-1 text-muted">{result.questions_for_seller.map((q, i) => <li key={i}>• {q}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </Tool>
  );
}

const TEMPLATES: Record<string, { de: string; title: TextKey }> = {
  first: {
    title: "seller_message",
    de: "Guten Tag,\n\nich interessiere mich für Ihr Auto. Ist es noch verfügbar? Gibt es ein Scheckheft und wann wurden Zahnriemen bzw. Steuerkette und Bremsen zuletzt gemacht? Gab es Unfälle?\n\nÜber eine kurze Antwort würde ich mich freuen.\n\nMit freundlichen Grüßen",
  },
  viewing: {
    title: "status_viewing",
    de: "Guten Tag,\n\nvielen Dank für Ihre Antwort. Ich würde mir das Auto gerne ansehen und eine kurze Probefahrt machen. Würde es Ihnen am {Tag} um {Uhrzeit} passen? Bitte lassen Sie den Motor vorher kalt, damit ich den Kaltstart hören kann.\n\nMit freundlichen Grüßen",
  },
  offer: {
    title: "negotiation",
    de: "Guten Tag,\n\ndanke für die Besichtigung. Mir gefällt das Auto, allerdings ist mir {Grund} aufgefallen. Ich könnte Ihnen {Betrag} € anbieten und das Auto zeitnah gegen bar abholen.\n\nMit freundlichen Grüßen",
  },
};

function MessagesTool() {
  const t = useT();
  const toast = useToast();
  const [which, setWhich] = useState<keyof typeof TEMPLATES>("first");
  const text = TEMPLATES[which].de;
  return (
    <Tool id="messages" title={t("tool_messages")} sub={t("tool_messages_sub")} hue="neutral" icon={<MessageSquareText className="size-5" />}>
      <Segmented size="sm" value={which} onChange={setWhich} options={[
        { value: "first", label: "1" }, { value: "viewing", label: "2" }, { value: "offer", label: "3" },
      ]} />
      <p className="mt-2 text-xs text-muted">{t(TEMPLATES[which].title)}</p>
      <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-surface-2 p-4 text-sm leading-relaxed ring-1 ring-line" dir="ltr">{text}</p>
      <Button className="mt-3" size="sm" variant="primary" onClick={async () => (await copyText(text)) && toast(t("copied"), "good")}>{t("copy")}</Button>
    </Tool>
  );
}
