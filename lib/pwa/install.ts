/**
 * Browser-side helpers shared by the install banner and the /install page.
 * Client-only: everything here reads `window` or `navigator`.
 *
 * The inline script in app/layout.tsx catches Chrome's install prompt into
 * `window.__installPrompt` as the HTML parses, because Chrome fires it once
 * and often before React has loaded. Whoever uses it clears it, since a
 * prompt can only be shown once.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type Platform = "android" | "ios" | "other";

type InstallWindow = Window & { __installPrompt?: BeforeInstallPromptEvent | null };

/** In-app browsers (WhatsApp, Facebook, Instagram…) that cannot install. */
export const IN_APP_UA = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|TikTok|musical_ly|; wv\)/i;

/** Runs as the HTML parses, before any React code. See app/layout.tsx. */
export const EARLY_INSTALL_SCRIPT =
  "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPrompt=e;});" +
  "window.addEventListener('appinstalled',function(){window.__installPrompt=null;});" +
  "if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});";

export function detectPlatform(ua: string): Platform {
  if (/android/i.test(ua)) return "android";
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  return "other";
}

/** True when running as the installed app rather than in a browser tab. */
export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Chromium browsers (Chrome, Edge, Samsung Internet, Opera) can be prompted;
 *  Safari and Firefox cannot. */
export function canPromptInstall() {
  return "onbeforeinstallprompt" in window;
}

export function takeEarlyPrompt(): BeforeInstallPromptEvent | null {
  return (window as InstallWindow).__installPrompt ?? null;
}

export function clearEarlyPrompt() {
  (window as InstallWindow).__installPrompt = null;
}
