// "Teilen" from the Kleinanzeigen (AutoScout24, Autohero) app into AutoHalle.
// Android: the app receives the shared text directly (MainActivity).
// iPhone: Apple doesn't let a share extension open its app, so the extension posts a notification
// carrying the link; tapping it opens AutoHalle on the check. That needs permission for
// notifications, which the app asks for when the user sets sharing up.

import { isNativeApp } from "./device";
import { navigate } from "./router";

type Permission = "granted" | "denied" | "prompt" | "prompt-with-rationale";
const platform = () => (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() ?? "web";
export const isIPhoneApp = () => isNativeApp() && platform() === "ios";

const plugin = async () => (await import("@capacitor/local-notifications")).LocalNotifications;
let listening = false;

/** In the native app: a tapped notification from the share extension opens the check of its link. */
export async function listenForSharedAds() {
  if (listening || !isNativeApp()) return;
  listening = true;
  try {
    const notifications = await plugin();
    await notifications.addListener("localNotificationActionPerformed", (event) => {
      const url = (event.notification?.extra as { url?: unknown } | undefined)?.url;
      if (typeof url === "string" && url.trim()) navigate("analyze", null, { url: url.trim() });
    });
  } catch {
    listening = false; // plugin missing in an older app build: sharing then falls back to copy & paste
  }
}

/** iPhone only: whether sharing is set up ("granted"), still to set up ("prompt"), or turned off. */
export async function sharingPermission(): Promise<Permission | null> {
  if (!isIPhoneApp()) return null;
  try {
    return (await (await plugin()).checkPermissions()).display as Permission;
  } catch {
    return null;
  }
}

export async function enableSharing(): Promise<boolean> {
  try {
    return (await (await plugin()).requestPermissions()).display === "granted";
  } catch {
    return false;
  }
}
