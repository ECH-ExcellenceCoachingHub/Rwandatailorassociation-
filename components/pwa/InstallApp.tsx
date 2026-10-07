"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, ExternalLink, Info, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuthCopy } from "@/lib/i18n/dashboard/auth";
import {
  type BeforeInstallPromptEvent,
  type Platform,
  IN_APP_UA,
  canPromptInstall,
  clearEarlyPrompt,
  detectPlatform,
  isAppInstalled,
  isStandalone,
  takeEarlyPrompt,
} from "@/lib/pwa/install";

/**
 * The body of /install. Browsers do not let a page install itself without a
 * tap, and each platform has its own route, so this works out which one the
 * visitor is on and shows only that:
 *
 * - Android Chrome, Edge, Samsung Internet: the browser fires
 *   `beforeinstallprompt`; we hold on to it and one tap on our button opens
 *   the native install dialog.
 * - iPhone/iPad: Safari has no install API at all, so we show the three
 *   Share → Add to Home Screen steps.
 * - In-app browsers (WhatsApp, Facebook, Instagram…): cannot install. On
 *   Android we offer a button that reopens the page in Chrome; elsewhere,
 *   copy the link.
 * - Anything else (or the prompt never comes): point at the browser menu.
 *
 * Opened from the installed app itself, there is nothing to do, so it goes
 * straight to sign-in.
 */

type View = "ready" | "installing" | "installed" | "alreadyInstalled" | "ios" | "inApp" | "manual";

export default function InstallApp({ copy }: { copy: AuthCopy["install"] }) {
  // The server cannot see the phone, so it renders the install button: that is
  // what most visitors (Android Chrome) need, and it is on screen from the very
  // first paint. The effect below swaps it for iPhone steps etc. if needed.
  const [view, setView] = useState<View>("ready");
  const [platform, setPlatform] = useState<Platform>("other");
  const [supported, setSupported] = useState<boolean | null>(null);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const waiter = useRef<((e: BeforeInstallPromptEvent | null) => void) | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      window.location.replace("/login");
      return;
    }

    const ua = navigator.userAgent;
    const p = detectPlatform(ua);
    const canPrompt = canPromptInstall();
    const initial: View = IN_APP_UA.test(ua)
      ? "inApp"
      : p === "ios"
        ? "ios"
        : canPrompt
          ? "ready"
          : "manual";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser, which the server render cannot see
    setPlatform(p);
    setSupported(canPrompt || p === "ios");
    setView(initial);
    if (initial !== "ready") return;

    deferred.current = takeEarlyPrompt();
    let live = true;
    // No prompt yet may just mean it is still coming; but if the app is
    // already installed it never will, so say so instead of offering a
    // button that cannot work.
    if (!deferred.current) {
      void isAppInstalled().then((installed) => {
        if (live && installed && !deferred.current) setView("alreadyInstalled");
      });
    }

    // Not preventDefault: on this page Chrome's own install bar is wanted.
    // See EARLY_INSTALL_SCRIPT.
    const onPrompt = (e: Event) => {
      deferred.current = e as BeforeInstallPromptEvent;
      waiter.current?.(deferred.current);
      // Chrome offering to install means it is not installed after all.
      setView((v) => (v === "alreadyInstalled" ? "ready" : v));
    };
    const onInstalled = () => {
      deferred.current = null;
      setView("installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      live = false;
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /** The browser's prompt, waiting briefly if the button was tapped before it
   *  arrived. Chrome keeps a tap "fresh" for about five seconds, so a prompt
   *  that turns up within that can still be shown. */
  function promptEvent(): Promise<BeforeInstallPromptEvent | null> {
    if (deferred.current) return Promise.resolve(deferred.current);
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(null), 4000);
      waiter.current = (e) => {
        window.clearTimeout(timer);
        resolve(e);
      };
    });
  }

  async function install() {
    setView("installing");
    const event = await promptEvent();
    waiter.current = null;
    if (!event) {
      // No prompt: the app is already installed, or the browser declined to
      // offer it. Its own menu still works.
      setView((await isAppInstalled()) ? "alreadyInstalled" : "manual");
      return;
    }
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      setView(outcome === "accepted" ? "installed" : "ready");
    } catch {
      setView("manual");
    } finally {
      // A prompt event can only be used once.
      deferred.current = null;
      clearEarlyPrompt();
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked; the URL is still in the address bar.
    }
  }

  function chromeIntentUrl() {
    const { host, pathname, search } = window.location;
    return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
  }

  return (
    <div className="text-center">
      <h1 className="font-heading text-2xl font-bold text-ink">{copy.title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{copy.subtitle}</p>

      <div className="mt-8">
        {(view === "ready" || view === "installing") && (
          <Button size="lg" className="w-full" onClick={install} disabled={view === "installing"}>
            <Download className="size-5" />
            {view === "installing" ? copy.installing : copy.installButton}
          </Button>
        )}

        {view === "alreadyInstalled" && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-success/10 px-4 py-4">
              <p className="flex items-center justify-center gap-2 font-heading text-base font-semibold text-ink">
                <Check className="size-5 shrink-0 text-success" />
                {copy.alreadyInstalledTitle}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{copy.alreadyInstalledBody}</p>
            </div>
            <Button asChild size="lg" className="w-full">
              <Link href="/login">{copy.openApp}</Link>
            </Button>
          </div>
        )}

        {supported !== null && view !== "installed" && view !== "alreadyInstalled" && (
          <p
            className={`mt-4 flex items-center justify-center gap-1.5 text-xs font-medium ${
              supported ? "text-success" : "text-ink-muted"
            }`}
          >
            {supported ? <Check className="size-4" /> : <Info className="size-4" />}
            {supported ? copy.supported : copy.notSupported}
          </p>
        )}

        {view === "installed" && (
          <div className="space-y-5">
            <p className="flex items-center justify-center gap-2 rounded-2xl bg-success/10 px-4 py-3 text-sm font-medium text-ink">
              <Check className="size-5 shrink-0 text-success" />
              {copy.installed}
            </p>
            <Button asChild size="lg" className="w-full">
              <Link href="/login">{copy.openApp}</Link>
            </Button>
          </div>
        )}

        {view === "ios" && (
          <div className="rounded-2xl border border-border bg-surface p-5 text-left">
            <h2 className="font-heading text-base font-semibold text-ink">{copy.iosTitle}</h2>
            <ol className="mt-4 space-y-4 text-sm text-ink">
              <Step n={1} icon={<Share className="size-5 text-primary" />} text={copy.iosStep1} />
              <Step n={2} icon={<SquarePlus className="size-5 text-primary" />} text={copy.iosStep2} />
              <Step n={3} icon={<Check className="size-5 text-primary" />} text={copy.iosStep3} />
            </ol>
            <p className="mt-4 text-xs text-ink-muted">{copy.iosSafariOnly}</p>
          </div>
        )}

        {view === "inApp" && (
          <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-heading text-base font-semibold text-ink">{copy.inAppTitle}</h2>
            <p className="text-sm leading-relaxed text-ink-muted">{copy.inAppBody}</p>
            {platform === "android" && (
              <Button asChild size="lg" className="w-full">
                <a href={chromeIntentUrl()}>
                  <ExternalLink className="size-5" />
                  {copy.openInBrowser}
                </a>
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={copyLink}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? copy.copied : copy.copyLink}
            </Button>
          </div>
        )}

        {view === "manual" && (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-heading text-base font-semibold text-ink">{copy.manualTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{copy.manualBody}</p>
          </div>
        )}
      </div>

      {view !== "installed" && view !== "alreadyInstalled" && (
        <p className="mt-8 text-sm">
          <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
            {copy.continueInBrowser}
          </Link>
        </p>
      )}
    </div>
  );
}

function Step({ n, icon, text }: { n: number; icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-50 font-heading text-sm font-bold text-primary">
        {n}
      </span>
      <span className="flex-1 pt-1.5 leading-relaxed">{text}</span>
      <span className="pt-1">{icon}</span>
    </li>
  );
}
