/**
 * Browser-side helpers shared by the install banner and the /install page.
 * Client-only: everything here reads `window` or `navigator`.
 *
 * The inline script in app/layout.tsx catches Chrome's install prompt into
 * `window.__installPrompt` as the HTML parses, because Chrome fires it once
 * and often before React has loaded. Whoever uses it clears it, since a
 * prompt can only be shown once.
 */

import { RESERVED_ASSOCIATION_CODES } from "@/lib/brand";
import { appInstalledKey } from "@/lib/pwa/apps";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type Platform = "android" | "ios" | "other";

type InstallWindow = Window & { __installPrompt?: BeforeInstallPromptEvent | null };

/** In-app browsers (WhatsApp, Facebook, Instagram…) that cannot install. */
export const IN_APP_UA = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|TikTok|musical_ly|; wv\)/i;

/**
 * Remembers that the app is on this phone — one mark per app, keyed by
 * appInstalledKey. Chrome stops offering to install an app that is already
 * installed, so without this the install button would wait for a prompt that
 * never comes. On Android the installed app and Chrome share storage, so
 * opening the app once marks it for the browser too.
 *
 * The script below works out the app from the path the same way
 * appSlugFromPath does, with the reserved codes written into it, because it
 * runs before any module has loaded.
 */
const RESERVED = JSON.stringify([...RESERVED_ASSOCIATION_CODES]);

/** Runs as the HTML parses, before any React code. See app/layout.tsx.
 *  A prompt arriving means Chrome thinks the app is *not* installed (perhaps
 *  it was removed), so it clears the mark.
 *
 *  This is the only place that decides whether Chrome may show its own
 *  install bar, since one preventDefault from any listener hides it. On
 *  /install we let it through: no page may open the install dialog without a
 *  tap, but Chrome's own bar appears by itself as the page loads, which is as
 *  close to automatic as browsers allow. Everywhere else it is held back for
 *  our banner. The saved event still works for our buttons either way.
 *
 *  "/install" means the page's own app's: /install, /rta/install, /abc/install.
 *
 *  It also puts the manifest link in the <head> on the way through — the
 *  manifest of the app the page belongs to, so on /rta Chrome offers RTA's. A page
 *  with an async generateMetadata — /install and /login are both built on the
 *  request's locale cookie — gets its entire metadata tree, manifest link
 *  included, held back by React and floated into a hidden <div> at the end of
 *  the <body> once the request resolves. Chrome looks for the manifest in the
 *  <head>, and it looks while the page loads, long before that div is filled:
 *  such a page never fetches the manifest, never fires beforeinstallprompt,
 *  and the install button on /install never arms. Static pages already have
 *  the link in their head, so the guard leaves those untouched. */
export const EARLY_INSTALL_SCRIPT =
  "(function(){function s(f){try{f()}catch(e){}}" +
  "var g=location.pathname.split('/')[1]||'',a=/^[a-z]{2,8}$/i.test(g)&&" + RESERVED + ".indexOf(g.toUpperCase())<0?g.toLowerCase():'';" +
  "var b=a?'/'+a:'',k='" + appInstalledKey(null) + "'+(a?':'+a:'');" +
  "if(!document.querySelector('link[rel=\"manifest\"]')){var m=document.createElement('link');m.rel='manifest';m.href=b+'/manifest.webmanifest';document.head.appendChild(m);}" +
  "window.addEventListener('beforeinstallprompt',function(e){if(location.pathname.toLowerCase().indexOf(b+'/install')!==0)e.preventDefault();window.__installPrompt=e;s(function(){localStorage.removeItem(k)});});" +
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

/** Best guess at whether this page's app is already installed on this device.
 *  getInstalledRelatedApps answers for the manifest the page links, which is
 *  the same app. */
export async function isAppInstalled(slug: string | null): Promise<boolean> {
  try {
    if (localStorage.getItem(appInstalledKey(slug)) === "1") return true;
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
