"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import {
  type BeforeInstallPromptEvent,
  canPromptInstall,
  clearEarlyPrompt,
  detectPlatform,
  isStandalone,
  takeEarlyPrompt,
} from "@/lib/pwa/install";

/**
 * "Install the app" bar along the bottom of every page.
 *
 * Where the browser has given us its install prompt (Android Chrome and
 * friends), the button opens it directly. Everywhere else, iPhone and in-app
 * browsers included, it goes to /install, which explains that phone's steps.
 *
 * Hidden inside the installed app, on /install itself (which is all about
 * installing), and for a week after someone closes it.
 */

const DISMISS_KEY = "rta-install-banner-dismissed";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

export function InstallBanner() {
  const pathname = usePathname();
  const { d } = useLanguage();
  const copy = d.auth.install;
  const [show, setShow] = useState(false);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;
    // Desktop browsers without an install prompt (Safari, Firefox) have
    // nothing useful to offer, so the bar is not worth the space there.
    if (detectPlatform(navigator.userAgent) === "other" && !canPromptInstall()) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser, which the server render cannot see
    setShow(true);
    setPrompt(takeEarlyPrompt());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show || pathname.startsWith("/install")) return null;

  async function install() {
    if (!prompt) return;
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setShow(false);
    } finally {
      // A prompt event can only be used once.
      setPrompt(null);
      clearEarlyPrompt();
    }
  }

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Storage blocked: it will simply show again next visit.
    }
  }

  const button =
    "inline-flex h-10 shrink-0 items-center rounded-full bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover active:scale-[0.98]";

  return (
    <div
      role="region"
      aria-label={copy.bannerTitle}
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4"
    >
      <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1 text-left">
          <p className="font-heading text-sm font-semibold leading-snug text-ink">{copy.bannerTitle}</p>
          <p className="line-clamp-2 text-xs leading-snug text-ink-muted">{copy.bannerBody}</p>
        </div>
        {prompt ? (
          <button type="button" onClick={install} className={button}>
            {copy.bannerInstall}
          </button>
        ) : (
          <Link href="/install" className={button}>
            {copy.bannerInstall}
          </Link>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label={copy.bannerDismiss}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-ink/5"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
