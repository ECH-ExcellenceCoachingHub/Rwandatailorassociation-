"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import {
  type BeforeInstallPromptEvent,
  canPromptInstall,
  clearEarlyPrompt,
  detectPlatform,
  isAppInstalled,
  isStandalone,
  takeEarlyPrompt,
} from "@/lib/pwa/install";

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

type BannerView = "idle" | "installing" | "installed";

export function InstallBanner() {
  const pathname = usePathname();
  const { d } = useLanguage();
  const copy = d.auth.install;
  const [show, setShow] = useState(false);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [view, setView] = useState<BannerView>("idle");

  useEffect(() => {

    if (isStandalone()) return;
    // Desktop browsers without an install prompt (Safari, Firefox) have
    // nothing useful to offer, so the bar is not worth the space there.
    if (detectPlatform(navigator.userAgent) === "other" && !canPromptInstall()) return;

    const early = takeEarlyPrompt();
    let live = true;
    if (early) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser, which the server render cannot see
      setShow(true);
      setPrompt(early);
    } else {
      void isAppInstalled().then((installed) => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser, which the server render cannot see
        if (live && !installed) setShow(true);
      });
    }

    const onPrompt = (e: Event) => {
      setPrompt(e as BeforeInstallPromptEvent);
      setShow(!dismissedRecently());
    };
    const onInstalled = () => {
      setView("installed");
      setPrompt(null);
      clearEarlyPrompt();
      setTimeout(() => setShow(false), 3000);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      live = false;
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  async function install() {
    if (!prompt || view !== "idle") return;
    setView("installing");
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome !== "accepted") setView("idle");
    } finally {
      setPrompt(null);
      clearEarlyPrompt();
    }
  }

  function dismiss() {
    setShow(false);
    setView("idle");
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Storage blocked: it will simply show again next visit.
    }
  }

  const button =
    "inline-flex h-12 shrink-0 items-center rounded-full bg-primary px-5 text-base font-semibold text-white hover:bg-primary-hover active:scale-[0.98]";

  return (
    <div
      role="region"
      aria-label={copy.bannerTitle}
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-4 rounded-3xl border border-border bg-surface p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={72}
          height={72}
          className="size-[72px] shrink-0 rounded-2xl shadow-md"
        />
        <div className="min-w-0 flex-1 text-left">
          <p className="font-heading text-lg font-semibold leading-snug text-ink">{copy.bannerTitle}</p>
          {view === "installed" ? (
            <p className="line-clamp-2 text-sm leading-snug text-success">{copy.installed}</p>
          ) : view === "installing" ? (
            <p className="line-clamp-2 text-sm leading-snug text-ink-muted">{copy.installing}</p>
          ) : (
            <p className="line-clamp-2 text-sm leading-snug text-ink-muted">{copy.bannerBody}</p>
          )}
        </div>
        {view === "installed" ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
            <Check className="size-5" />
          </span>
        ) : view === "installing" ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Loader2 className="size-5 animate-spin" />
          </span>
        ) : prompt ? (
          <button type="button" onClick={install} className={button}>
            {copy.bannerInstall}
          </button>
        ) : (
          <a href={`/install?returnTo=${encodeURIComponent(pathname)}`} className={button}>
            {copy.bannerInstall}
          </a>
        )}
        {view === "idle" && (
          <button
            type="button"
            onClick={dismiss}
            aria-label={copy.bannerDismiss}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-ink/5"
          >
            <X className="size-5" />
          </button>
        )}
      </div>
    </div>
  );
}
