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

// Installable on the home screen; the service worker only caches the app shell.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
}
