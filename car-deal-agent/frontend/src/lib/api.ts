import type { Job, Meta, Prefs, TextScan } from "./types";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
      signal: init.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError("offline", 0);
  }
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = data?.error ?? data?.detail ?? {};
    const code = typeof error === "object" && error?.code ? String(error.code) : response.status === 422 ? "bad_input" : "server";
    if (response.status === 401 && code === "login") onUnauthorized();
    throw new ApiError(code, response.status, typeof error === "object" ? error : {});
  }
  return data as T;
}

export const getMeta = () => api<Meta>("/api/meta");
export const login = (code: string) => api<{ name: string; admin: boolean }>("/api/auth/login", { body: { code } });
export const logout = () => api("/api/auth/logout", { method: "POST" });
export const deleteAccount = () => api<{ deleted: boolean }>("/api/account/delete", { method: "POST" });

/** Starts a job and polls it until it ends; `onUpdate` gets every state. Abort to cancel it on the server. */
export async function runJob<T>(
  kind: "analyze" | "valuate" | "hunt",
  body: unknown,
  onUpdate: (job: Job<T>) => void,
  signal?: AbortSignal,
): Promise<Job<T>> {
  const { job_id } = await api<{ job_id: string }>(`/api/jobs/${kind}`, { body });
  let delay = 700;
  for (;;) {
    if (signal?.aborted) {
      await api(`/api/jobs/${job_id}/cancel`, { method: "POST" }).catch(() => undefined);
      throw new DOMException("cancelled", "AbortError");
    }
    const job = await api<Job<T>>(`/api/jobs/${job_id}`);
    onUpdate(job);
    if (job.status === "done" || job.status === "error" || job.status === "cancelled") return job;
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay + 150, 1500);
  }
}

export async function cancelJob(jobId: string) {
  await api(`/api/jobs/${jobId}/cancel`, { method: "POST" }).catch(() => undefined);
}

export const chat = (context: unknown, messages: { role: string; content: string }[], prefs: Prefs) =>
  api<{ answer: string }>("/api/ai/chat", { body: { context, messages, prefs } });

export const scanText = (text: string, prefs: Prefs) => api<TextScan>("/api/ai/scan", { body: { text, prefs } });

export const distance = (origin: string, target: string, roadFactor = 1.3) =>
  api<{ km: number }>(`/api/tools/distance?origin=${origin}&target=${target}&road_factor=${roadFactor}`);
