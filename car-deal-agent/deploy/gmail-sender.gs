/**
 * AutoHalle – sends the login codes from your own Gmail account. Free (Gmail allows about 100
 * recipients a day), works with Render's free plan.
 *
 * Setup (once, about 3 minutes):
 *  1. https://script.google.com → "Neues Projekt", replace everything with this file.
 *  2. Change SECRET below to a long word only you know; put the same word into Render as
 *     GMAIL_SCRIPT_SECRET.
 *  3. "Bereitstellen" → "Neue Bereitstellung" → type "Web-App", run as "Ich", access "Jeder"
 *     → "Bereitstellen" → allow access to your Gmail (Google warns that it does not know the app:
 *     "Erweitert" → "Zu … wechseln" – it is your own script).
 *  4. Copy the web app URL (…/exec) into Render as GMAIL_SCRIPT_URL.
 */
const SECRET = "HIER-EIN-LANGES-GEHEIMES-WORT";

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: "bad request" });
  }
  if (SECRET.indexOf("HIER-") === 0) return reply({ ok: false, error: "set SECRET in the script first" });
  if (data.secret !== SECRET) return reply({ ok: false, error: "wrong secret" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.to || "")) return reply({ ok: false, error: "bad address" });
  if (MailApp.getRemainingDailyQuota() < 1) return reply({ ok: false, error: "daily Gmail limit reached" });
  MailApp.sendEmail({ to: data.to, subject: data.subject, body: data.text, htmlBody: data.html, name: data.name || "AutoHalle" });
  return reply({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
}

function reply(answer) {
  return ContentService.createTextOutput(JSON.stringify(answer)).setMimeType(ContentService.MimeType.JSON);
}
