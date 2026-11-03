// Runs on AutoHalle's pages: passes the app's page requests to the extension's background (the
// page itself may not read other sites) and the pages back. Answers "ping" with "hello", so the
// app knows the helper is installed.

(() => {
  const MARKETPLACE_PAGE = /^https:\/\/(?:www\.)?(?:kleinanzeigen\.de|autoscout24\.[a-z]{2,3}(?:\.[a-z]{2})?|autohero\.com)\//i;
  const version = chrome.runtime.getManifest().version;
  const post = (message) => window.postMessage({ source: "autohalle-extension", ...message }, window.location.origin);
  const hello = () => post({ type: "hello", version });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== "autohalle-app") return;
    if (data.type === "ping") {
      hello();
    } else if (data.type === "load") {
      const reply = (page) => post({ type: "page", id: data.id, ...page });
      if (typeof data.url !== "string" || !MARKETPLACE_PAGE.test(data.url)) {
        reply({ status: 0, body: "", url: String(data.url || ""), error: "not_allowed" });
        return;
      }
      chrome.runtime.sendMessage({ type: "load", url: data.url }).then(
        (page) => reply(page || { status: 0, body: "", url: data.url, error: "no_answer" }),
        (error) => reply({ status: 0, body: "", url: data.url, error: String((error && error.message) || error) }),
      );
    }
  });
  hello();
})();
