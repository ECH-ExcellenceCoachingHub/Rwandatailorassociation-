"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, ExternalLink, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuthCopy } from "@/lib/i18n/dashboard/auth";

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

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "android" | "ios" | "other";
type View = "detecting" | "prompt" | "installing" | "installed" | "ios" | "inApp" | "manual";

const IN_APP_UA = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|TikTok|musical_ly|; wv\)/i;

function detectPlatform(ua: string): Platform {
  if (/android/i.test(ua)) return "android";
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  return "other";
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function InstallApp({ copy }: { copy: AuthCopy["install"] }) {
  const [view, setView] = useState<View>("detecting");
  const [platform, setPlatform] = useState<Platform>("other");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      window.location.replace("/login");
      return;
    }

    const ua = navigator.userAgent;
    const p = detectPlatform(ua);
    const early = (window as Window & { __installPrompt?: BeforeInstallPromptEvent }).__installPrompt;
    const initial: View = IN_APP_UA.test(ua) ? "inApp" : p === "ios" ? "ios" : early ? "prompt" : "detecting";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser, which the server render cannot see
    setPlatform(p);
    setView(initial);
    if (initial !== "prompt" && initial !== "detecting") return;
    if (early) setDeferred(early);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setView("prompt");
    };
    const onInstalled = () => {
      setDeferred(null);
      setView("installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // The prompt normally arrives within a second of the service worker
    // registering. If it has not by now, this browser will not send one.
    const fallback = window.setTimeout(() => {
      setView((v) => (v === "detecting" ? "manual" : v));
    }, 4000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(fallback);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    setView("installing");
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // A prompt event can only be used once.
    setDeferred(null);
    setView(outcome === "accepted" ? "installed" : "manual");
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
        {view === "detecting" && <div className="mx-auto h-14 w-full animate-pulse rounded-full bg-ink/5" />}

        {(view === "prompt" || view === "installing") && (
          <Button size="lg" className="w-full" onClick={install} disabled={view === "installing"}>
            <Download className="size-5" />
            {view === "installing" ? copy.installing : copy.installButton}
          </Button>
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

      {view !== "installed" && (
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
