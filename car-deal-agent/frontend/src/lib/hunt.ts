import { ApiError, api } from "./api";
import { createScopedStore, markSeen, saveResult } from "./store";
import type { HuntResult, Job, Result } from "./types";

// The deal hunt runs on the server; this follows it from anywhere in the app. Leaving the hunt
// page, opening a found car or closing the app does not stop it: the job id is kept, and the app
// picks the hunt up again (also after a restart) until it ends.

export interface HuntState {
  jobId: string | null;
  job: Job<HuntResult> | null;
  found: Result[];
  summary: HuntResult | null;
  error: { code: string; [key: string]: unknown } | null;
  stopping: boolean;
}

const EMPTY: HuntState = { jobId: null, job: null, found: [], summary: null, error: null, stopping: false };

// Found cars keep only what the cards need on the way; the full result is saved per car.
const slim = (result: Result): Result => ({ ...result, valuation: { ...result.valuation, used: result.valuation.used.slice(0, 40) } });

export const huntStore = createScopedStore<HuntState>("ah.huntRun", EMPTY);

let following = false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startHunt(body: unknown) {
  huntStore.set({ ...EMPTY });
  try {
    const { job_id } = await api<{ job_id: string }>("/api/jobs/hunt", { body });
    huntStore.set({ ...EMPTY, jobId: job_id });
    follow();
  } catch (err) {
    huntStore.set({ ...EMPTY, error: { code: err instanceof ApiError ? err.code : "server" } });
  }
}

/** Ends the hunt after the current ad; what was found so far stays. */
export async function stopHunt() {
  const { jobId } = huntStore.get();
  if (!jobId) return;
  huntStore.set((state) => ({ ...state, stopping: true }));
  await api(`/api/jobs/${jobId}/cancel`, { method: "POST" }).catch(() => undefined);
}

export function clearHunt() {
  if (!huntStore.get().jobId) huntStore.set({ ...EMPTY });
}

/** Called when the app starts or comes back: carries on with a hunt that was running. */
export async function resumeHunt() {
  if (huntStore.get().jobId) {
    follow();
    return;
  }
  // The phone may have lost the id (storage cleared): ask the server for this user's running hunt.
  try {
    const active = await api<{ id: string; kind: string; status: string }[]>("/api/jobs/active");
    const hunt = active.find((job) => job.kind === "hunt" && (job.status === "queued" || job.status === "running"));
    if (hunt) {
      huntStore.set({ ...EMPTY, jobId: hunt.id });
      follow();
    }
  } catch {
    /* not signed in or offline: nothing to resume */
  }
}

async function follow() {
  if (following) return;
  following = true;
  let delay = 900;
  try {
    for (;;) {
      const { jobId } = huntStore.get();
      if (!jobId) return;
      let job: Job<HuntResult>;
      try {
        job = await api<Job<HuntResult>>(`/api/jobs/${jobId}`);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 401)) {
          // The server forgot the job (restarted, or it ended long ago): keep what was found.
          huntStore.set((state) => ({ ...state, jobId: null, job: null, stopping: false, error: state.found.length ? null : { code: "no_job" } }));
          return;
        }
        await sleep(3000); // offline or the server is waking up: try again
        continue;
      }
      const finished = job.status === "done" || job.status === "error" || job.status === "cancelled";
      const found = ((job.result?.found ?? job.partial.found ?? []) as Result[]).map(slim);
      if (!finished) {
        huntStore.set((state) => ({ ...state, job, found }));
        await sleep(delay);
        delay = Math.min(delay + 200, 2500);
        continue;
      }
      job.result?.found.forEach((result) => saveResult(result));
      if (job.partial?.checked_ids) markSeen(job.partial.checked_ids as string[]);
      huntStore.set({ ...EMPTY, found, summary: job.result ? { ...job.result, found } : null, error: job.error });
      return;
    }
  } finally {
    following = false;
  }
}
