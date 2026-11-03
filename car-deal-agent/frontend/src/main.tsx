import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppProvider } from "./lib/app";
import { isNativeApp } from "./lib/device";
import { setAccountScope } from "./lib/store";
// Fonts are served by the app itself, not loaded from Google (no visitor data to third parties).
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-sans/latin-ext-400.css";
import "@fontsource/ibm-plex-sans/latin-ext-500.css";
import "@fontsource/ibm-plex-sans/latin-ext-600.css";
import "@fontsource/ibm-plex-sans/latin-ext-700.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-500.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-700.css";
import "./styles.css";

// Show the data of the account last signed in here at once; the server confirms it a moment later.
try {
  const known = JSON.parse(localStorage.getItem("ah.meta") || "null");
  setAccountScope(known?.account?.id ?? null, Boolean(known?.account?.admin) || known?.auth_required === false);
} catch {
  /* no stored account */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);

// The start animation (index.html) stays at least this long, then the app slides in.
const SPLASH_MS = 1900;
const splash = document.getElementById("splash");
if (splash) {
  setTimeout(() => {
    document.body.classList.add("intro");
    splash.classList.add("out");
    setTimeout(() => splash.remove(), 500);
    setTimeout(() => document.body.classList.remove("intro"), 1400);
  }, Math.max(0, SPLASH_MS - performance.now()));
}

// Installable on the home screen; the service worker only caches the app shell.
// The native app has its files on board (updates come through the store): no service worker there.
if ("serviceWorker" in navigator && import.meta.env.PROD && !isNativeApp()) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
}
