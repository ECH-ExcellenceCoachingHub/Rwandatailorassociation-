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

/**
 * Remembers that the app is on this phone. Chrome stops offering to install
 * an app that is already installed, so without this the install button would
 * wait for a prompt that never comes. On Android the installed app and Chrome
 * share storage, so opening the app once marks it for the browser too.
 */
const INSTALLED_KEY = "rta-app-installed";

/** Runs as the HTML parses, before any React code. See app/layout.tsx.
 *  A prompt arriving means Chrome thinks the app is *not* installed (perhaps
 *  it was removed), so it clears the mark.
 *
 *  This is the only place that decides whether Chrome may show its own
 *  install bar, since one preventDefault from any listener hides it. On
 *  /install we let it through: no page may open the install dialog without a
 *  tap, but Chrome's own bar appears by itself as the page loads, which is as
 *  close to automatic as browsers allow. Everywhere else it is held back for
 *  our banner. The saved event still works for our buttons either way. */
export const EARLY_INSTALL_SCRIPT =
  "(function(){var k='" + INSTALLED_KEY + "';function s(f){try{f()}catch(e){}}" +
  "window.addEventListener('beforeinstallprompt',function(e){if(location.pathname.indexOf('/install')!==0)e.preventDefault();window.__installPrompt=e;s(function(){localStorage.removeItem(k)});});" +
  "window.addEventListener('appinstalled',function(){window.__installPrompt=null;s(function(){localStorage.setItem(k,'1')});});" +
  "if(matchMedia('(display-mode: standalone)').matches||navigator.standalone)s(function(){localStorage.setItem(k,'1')});})();" +
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

/** Best guess at whether the app is already installed on this device. */
export async function isAppInstalled(): Promise<boolean> {
  try {
    if (localStorage.getItem(INSTALLED_KEY) === "1") return true;
  } catch {
    // Storage blocked; fall through to asking the browser.
  }
  const nav = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<unknown[]>;
  };
  if (!nav.getInstalledRelatedApps) return false;
  try {
    return (await nav.getInstalledRelatedApps()).length > 0;
  } catch {
    return false;
  }
}
