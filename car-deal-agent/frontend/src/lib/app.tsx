import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ApiError, getMeta, setUnauthorizedHandler } from "./api";
import { isNativeApp } from "./device";
import { DEFAULT_PREFS, prefsStore, setAccountScope } from "./store";
import type { Meta } from "./types";

interface AppState {
  meta: Meta | null;
  metaError: string | null;
  /** The server is taking long to answer (it is starting) or cannot be reached; the app keeps trying. */
  waking: boolean;
  /** A newer version of the app was downloaded; reloading shows it. */
  updateReady: boolean;
  needsLogin: boolean;
  refresh: () => Promise<void>;
  setNeedsLogin: (value: boolean) => void;
}

const AppContext = createContext<AppState>({
  meta: null,
  metaError: null,
  waking: false,
  updateReady: false,
  needsLogin: false,
  refresh: async () => {},
  setNeedsLogin: () => {},
});

const META_KEY = "ah.meta";

function cachedMeta(): Meta | null {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "null");
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  // The last known meta lets the app start at once (and know whether a login is needed) while the
  // server may still be waking up.
  const [meta, setMeta] = useState<Meta | null>(cachedMeta);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(() => {
    const known = cachedMeta();
    return Boolean(known?.auth_required && !known.account);
  });
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  const firstAnswer = useRef(true);

  const refresh = useCallback(async () => {
    if (retry.current) clearTimeout(retry.current);
    const slow = setTimeout(() => setWaking(true), 2500);
    try {
      const data = await getMeta();
      // An older copy of the app (kept on the phone) talking to a newer server: right after the
      // start, load the new one at once (once per version); later, offer it. (Not in the native
      // app: its files come with the app, a new version through the store.)
      if (data.version !== __APP_VERSION__ && !isNativeApp()) {
        let tried = false;
        try {
          tried = sessionStorage.getItem("ah.reloadedFor") === data.version;
          if (firstAnswer.current && !tried) sessionStorage.setItem("ah.reloadedFor", data.version);
        } catch {
          tried = true;
        }
        if (firstAnswer.current && !tried) {
          window.location.reload();
          return;
        }
        setUpdateReady(true);
      }
      firstAnswer.current = false;
      // Saved cars, garage and searches of the account that is signed in now.
      setAccountScope(data.account?.id ?? null, Boolean(data.account?.admin) || !data.auth_required);
      setMeta(data);
      setMetaError(null);
      setWaking(false);
      attempts.current = 0;
      setNeedsLogin(data.auth_required && !data.account);
      try {
        localStorage.setItem(META_KEY, JSON.stringify(data));
      } catch {
        /* storage full or blocked */
      }
      // New settings the server knows about get their defaults; the user's own values stay.
      prefsStore.set((prefs) => ({ ...DEFAULT_PREFS, ...data.defaults, ...prefs }));
    } catch (error) {
      setMetaError(error instanceof ApiError ? error.code : "offline");
      setWaking(true);
      attempts.current += 1;
      retry.current = setTimeout(() => refresh(), Math.min(2000 * attempts.current, 10000));
    } finally {
      clearTimeout(slow);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setNeedsLogin(true));
    refresh();
    const onMessage = (event: MessageEvent) => event.data?.type === "ah:update" && setUpdateReady(true);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    // Back from the background: check the session and wake the server early.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
      if (retry.current) clearTimeout(retry.current);
    };
  }, [refresh]);

  return (
    <AppContext.Provider value={{ meta, metaError, waking, updateReady, needsLogin, refresh, setNeedsLogin }}>{children}</AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
