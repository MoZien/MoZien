import { Gauge } from "lucide-react";
import { DeviceHint } from "../components/DeviceHint";
import { useRef, useState } from "react";
import { JobProgress } from "../components/JobProgress";
import { PurposeSwitch } from "../components/PurposeSwitch";
import { ResultView } from "../components/ResultView";
import { Button, Card, Field, Input, Note, NumberInput, Select, Toggle } from "../components/ui";
import { ApiError, runJob } from "../lib/api";
import { useApp } from "../lib/app";
import { useT } from "../lib/i18n";
import { createStore, prefsStore, saveResult, uiStore, useStore } from "../lib/store";
import type { Job, ManualCar, Result } from "../lib/types";
import { errorText } from "./Analyze";

const carStore = createStore<ManualCar>("ah.manual", {
  make: "volkswagen", model: "Golf", year: 2012, month: null, km: 150000, power_ps: 105, fuel: "benzin",
  gearbox: "manuell", body_type: null, price: null, negotiable: true, zip_code: null, hu_until: null,
});

export function ValuatePage() {
  const t = useT();
  const { meta } = useApp();
  const car = useStore(carStore);
  const [job, setJob] = useState<Job<Result> | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ code: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const set = (patch: Partial<ManualCar>) => carStore.set((c) => ({ ...c, ...patch }));

  async function start() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setResult(null);
    try {
      const body = {
        car: { ...car, model: car.model.trim(), hu_until: /^\d{2}\/\d{4}$/.test(car.hu_until ?? "") ? car.hu_until : null },
        prefs: prefsStore.get(),
      };
      const done = await runJob<Result>("valuate", body, setJob, controller.signal);
      if (done.result) {
        setResult(done.result);
        if (uiStore.get().autoSave && done.result.valuation.market_price) saveResult(done.result);
      }
      if (done.error) setError(done.error);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError({ code: err instanceof ApiError ? err.code : "server" });
    } finally {
      setJob(null);
    }
  }

  const years = Array.from({ length: new Date().getFullYear() - 1989 }, (_, i) => new Date().getFullYear() - i);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight">{t("valuate_title")}</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{t("valuate_sub")}</p>
      </div>
      <DeviceHint />
      <Card className="p-5">
        <div className="mb-4">
          <PurposeSwitch />
        </div>
        <form
          className="grid grid-cols-2 gap-4 md:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            start();
          }}
        >
          <Field label={t("make")}>
            <Select value={car.make} onChange={(e) => set({ make: e.target.value })}>
              {Object.entries(meta?.makes ?? { volkswagen: "Volkswagen" }).map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("model")}>
            <Input value={car.model} onChange={(e) => set({ model: e.target.value })} required placeholder="Golf" />
          </Field>
          <Field label={t("year")}>
            <Select value={car.year} onChange={(e) => set({ year: Number(e.target.value) })}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("month")}>
            <Select value={car.month ?? ""} onChange={(e) => set({ month: e.target.value ? Number(e.target.value) : null })}>
              <option value="">–</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {String(i + 1).padStart(2, "0")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("mileage")}>
            <NumberInput value={car.km} onChange={(v) => set({ km: v ?? 0 })} suffix="km" min={0} />
          </Field>
          <Field label={t("power")}>
            <NumberInput value={car.power_ps} onChange={(v) => set({ power_ps: v })} suffix="PS" allowEmpty />
          </Field>
          <Field label={t("fuel")}>
            <Select value={car.fuel ?? ""} onChange={(e) => set({ fuel: e.target.value || null })}>
              <option value="">–</option>
              {Object.entries(meta?.fuels ?? {}).map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("gearbox")}>
            <Select value={car.gearbox ?? ""} onChange={(e) => set({ gearbox: (e.target.value || null) as ManualCar["gearbox"] })}>
              <option value="">–</option>
              <option value="manuell">Manuell</option>
              <option value="automatik">Automatik</option>
            </Select>
          </Field>
          <Field label={t("body")}>
            <Select value={car.body_type ?? ""} onChange={(e) => set({ body_type: e.target.value || null })}>
              <option value="">–</option>
              {Object.entries(meta?.bodies ?? {}).map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("price_optional")}>
            <NumberInput value={car.price} onChange={(v) => set({ price: v })} suffix="€" allowEmpty />
          </Field>
          <Field label={t("zip")} hint={t("optional")}>
            <Input value={car.zip_code ?? ""} onChange={(e) => set({ zip_code: e.target.value.replace(/\D/g, "").slice(0, 5) || null })} inputMode="numeric" className="num" />
          </Field>
          <Field label={t("hu_until")}>
            <Input value={car.hu_until ?? ""} onChange={(e) => set({ hu_until: e.target.value || null })} placeholder="08/2027" className="num" />
          </Field>
          <div className="col-span-2 md:col-span-4">
            <Toggle checked={car.negotiable} onChange={(negotiable) => set({ negotiable })} label={t("negotiable")} />
          </div>
          <div className="col-span-2 md:col-span-4">
            <Button type="submit" variant="primary" size="lg" loading={job != null} icon={<Gauge className="size-4" />}>
              {t("value_it")}
            </Button>
          </div>
        </form>
      </Card>
      {job && <JobProgress job={job} onCancel={() => abort.current?.abort()} />}
      {error && <Note tone="bad">{errorText(t, error)}</Note>}
      {result && <ResultView result={result} onChange={setResult} />}
    </div>
  );
}
