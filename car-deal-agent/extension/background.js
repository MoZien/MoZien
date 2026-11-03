// AutoHalle Helfer: loads marketplace pages for the AutoHalle app (which may not read other sites
// itself). Only Kleinanzeigen, AutoScout24 and Autohero pages, only for AutoHalle's own pages,
// without the user's cookies: the platforms see an ordinary, anonymous visitor.

const MARKETPLACE_PAGE = /^https:\/\/(?:www\.)?(?:kleinanzeigen\.de|autoscout24\.[a-z]{2,3}(?:\.[a-z]{2})?|autohero\.com)\//i;
const APP_PAGE = /^(?:https:\/\/autohalle\.onrender\.com|http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?)\//;
const APP_URL = "https://autohalle.onrender.com/";
const TIMEOUT_MS = 25000;

async function load(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
      headers: { "Accept-Language": "de-DE,de;q=0.9" },
    });
    return { status: response.status, body: await response.text(), url: response.url || url };
  } catch (error) {
    return { status: 0, body: "", url, error: String((error && error.message) || error).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "load") return false;
  const fromApp = sender.id === chrome.runtime.id && APP_PAGE.test(sender.url || "");
  if (!fromApp || typeof message.url !== "string" || !MARKETPLACE_PAGE.test(message.url)) {
    sendResponse({ status: 0, body: "", url: String(message.url || ""), error: "not_allowed" });
    return false;
  }
  load(message.url).then(sendResponse);
  return true; // answers later
});

// The toolbar button opens the app.
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: APP_URL }));
