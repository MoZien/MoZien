// Keeps the app on the phone: when the server is awake it delivers the newest app (network
// first); when it sleeps (Render's free plan answers with its own wake-up page) or is slow, the
// app opens from this cache at once and waits for the server itself. API calls always go to the
// network.
const CACHE = "autohalle-v5";

// Only our own index page may become the shell, never a hosting provider's wake-up page.
const isAppShell = (response) => response.ok && response.headers.get("x-autohalle") === "1";

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

async function refreshShell() {
  try {
    const response = await fetch("/", { cache: "no-store" });
    if (!isAppShell(response)) return;
    const cache = await caches.open(CACHE);
    const old = await cache.match("/");
    const fresh = await response.clone().text();
    await cache.put("/", response);
    if (old && (await old.text()) !== fresh) {
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => client.postMessage({ type: "ah:update" }));
    }
  } catch {
    /* offline or asleep: keep the cached shell */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(refreshShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/health" || url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    // Network first, so an awake server always delivers the newest app. When it is asleep (the
    // host answers with its own wake-up page) or slow, the app from the cache opens instead and
    // waits for the server itself.
    event.respondWith(
      (async () => {
        const cached = await caches.match("/");
        try {
          const response = await withTimeout(fetch(request), cached ? 3500 : 60000);
          if (isAppShell(response)) {
            const cache = await caches.open(CACHE);
            await cache.put("/", response.clone());
            return response;
          }
          return cached || response;
        } catch {
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Built files carry a hash in their name: once cached they never change.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          const type = response.headers.get("content-type") || "";
          if (response.ok && !type.includes("text/html")) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
