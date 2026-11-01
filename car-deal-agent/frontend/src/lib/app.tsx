import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { ApiError, getMeta, setUnauthorizedHandler } from "./api";
import { DEFAULT_PREFS, prefsStore } from "./store";
import type { Meta } from "./types";

interface AppState {
  meta: Meta | null;
  metaError: string | null;
  needsLogin: boolean;
  refresh: () => Promise<void>;
  setNeedsLogin: (value: boolean) => void;
}

const AppContext = createContext<AppState>({
  meta: null,
  metaError: null,
  needsLogin: false,
  refresh: async () => {},
  setNeedsLogin: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getMeta();
      setMeta(data);
      setMetaError(null);
      setNeedsLogin(data.auth_required && !data.account);
      // New settings the server knows about get their defaults; the user's own values stay.
      prefsStore.set((prefs) => ({ ...DEFAULT_PREFS, ...data.defaults, ...prefs }));
    } catch (error) {
      setMetaError(error instanceof ApiError ? error.code : "offline");
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setNeedsLogin(true));
    refresh();
  }, [refresh]);

  return <AppContext.Provider value={{ meta, metaError, needsLogin, refresh, setNeedsLogin }}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
