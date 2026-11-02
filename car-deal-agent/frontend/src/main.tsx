import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppProvider } from "./lib/app";
import "./styles.css";

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
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
}
