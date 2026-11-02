// Opens the app straight from the phone: the app shell comes from this cache, so a sleeping server
// (Render's free plan) never shows its "loading" page. The shell is refreshed in the background
// after every start; API calls always go to the network.
const CACHE = "autohalle-v3";

// Only our own index page may become the shell, never a hosting provider's wake-up page.
const isAppShell = (response) => response.ok && response.headers.get("x-autohalle") === "1";

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
    event.respondWith(
      caches.match("/").then((cached) => {
        const update = refreshShell();
        if (cached) {
          event.waitUntil(update);
          return cached;
        }
        return fetch(request).catch(() => caches.match("/"));
      }),
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
