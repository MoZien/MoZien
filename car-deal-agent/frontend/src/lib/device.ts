// Loading marketplace pages on the user's device (the server's "device mode"): instead of the
// server, this phone or browser opens the ad and the comparison searches, like the user browsing,
// and hands the pages to the server, which only computes. Two ways to do it:
//   - the native app (Capacitor): its native HTTP may load other sites;
//   - a desktop browser with the AutoHalle extension, which loads the pages for this page.
// A normal browser tab can't (browsers don't let one site read another), so there the server
// loads the pages itself, if the server allows it.

/** The only pages ever loaded (the server asks for nothing else, and the extension checks too). */
export const MARKETPLACE_PAGE = /^https:\/\/(?:www\.)?(?:kleinanzeigen\.de|autoscout24\.[a-z]{2,3}(?:\.[a-z]{2})?|autohero\.com)\//i;
const PAGE_TIMEOUT_MS = 30_000;

export interface LoadedPage {
  status: number;
  body: string;
  url: string;
  error?: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let extensionVersion: string | null = null;
const waiting = new Map<number, (page: LoadedPage) => void>();
let nextId = 1;

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { CapacitorHttp?: { get: (options: Record<string, unknown>) => Promise<{ status: number; data: unknown; url?: string }> } };
}
const capacitor = (): CapacitorGlobal | undefined => (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;

export const isNativeApp = () => Boolean(capacitor()?.isNativePlatform?.());

/** "native" in the app, "extension" in a browser with the AutoHalle extension, else null. */
export function deviceKind(): "native" | "extension" | null {
  if (isNativeApp()) return "native";
  return extensionVersion ? "extension" : null;
}

export const canLoadPages = () => deviceKind() !== null;

export function onDeviceChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The extension's content script talks to this page through window messages.
if (typeof window !== "undefined") {
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== "autohalle-extension") return;
    if (data.type === "hello") {
      const known = extensionVersion;
      extensionVersion = String(data.version || "1");
      if (!known) listeners.forEach((listener) => listener());
    } else if (data.type === "page") {
      const done = waiting.get(data.id);
      if (done) {
        waiting.delete(data.id);
        done({ status: Number(data.status) || 0, body: typeof data.body === "string" ? data.body : "", url: String(data.url || ""), error: data.error ? String(data.error) : undefined });
      }
    }
  });
  // An extension that was there before this page loaded answers with "hello".
  window.postMessage({ source: "autohalle-app", type: "ping" }, window.location.origin);
}

/** Loads a marketplace page on this device. Never throws: failures come back as `error`. */
export async function loadPage(url: string): Promise<LoadedPage> {
  if (!MARKETPLACE_PAGE.test(url)) return { status: 0, body: "", url, error: "not_allowed" };
  if (isNativeApp()) return loadNative(url);
  if (extensionVersion) return loadWithExtension(url);
  return { status: 0, body: "", url, error: "no_device" };
}

async function loadNative(url: string): Promise<LoadedPage> {
  const headers = { "Accept-Language": "de-DE,de;q=0.9", Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8" };
  try {
    const http = capacitor()?.Plugins?.CapacitorHttp;
    if (http) {
      const answer = await http.get({ url, headers, responseType: "text", connectTimeout: PAGE_TIMEOUT_MS, readTimeout: PAGE_TIMEOUT_MS });
      const body = typeof answer.data === "string" ? answer.data : JSON.stringify(answer.data ?? "");
      return { status: answer.status, body, url: answer.url || url };
    }
    const response = await fetch(url, { headers, credentials: "omit" });
    return { status: response.status, body: await response.text(), url: response.url || url };
  } catch (error) {
    return { status: 0, body: "", url, error: String((error as Error)?.message || error).slice(0, 200) || "network" };
  }
}

function loadWithExtension(url: string): Promise<LoadedPage> {
  const id = nextId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve({ status: 0, body: "", url, error: "timeout" });
    }, PAGE_TIMEOUT_MS);
    waiting.set(id, (page) => {
      clearTimeout(timer);
      resolve(page);
    });
    window.postMessage({ source: "autohalle-app", type: "load", id, url }, window.location.origin);
  });
}
