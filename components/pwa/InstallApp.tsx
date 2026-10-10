"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Monitor,
  Share,
  Smartphone,
  SquarePlus,
  WifiOff,
} from "lucide-react";
import { LanguageToggle } from "@/components/ui/language-toggle";
import type { AuthCopy } from "@/lib/i18n/dashboard/auth";
import {
  type BeforeInstallPromptEvent,
  type Platform,
  IN_APP_UA,
  canPromptInstall,
  detectPlatform,
  isAppInstalled,
  isStandalone,
  takeEarlyPrompt,
} from "@/lib/pwa/install";

type View =
  | "ready"
  | "installing"
  | "preparing"
  | "installed"
  | "alreadyInstalled"
  | "ios"
  | "inApp"
  | "manual";

/**
 * /install, the whole page.
 *
 * One centred card and nothing else. The page used to open with the navy brand
 * panel — the STGT lockup, a headline, a tagline, a paragraph and a copyright
 * beside the steps — which is a lot to read before the single thing the visitor
 * arrived to do. Now the app icon, one line of copy and the install button
 * carry the screen; the brand survives as a small mark in the corner, and the
 * language switch travels with the page because the (auth) layout that used to
 * provide it no longer wraps it.
 *
 * The states are unchanged from what they always were: one-tap install where
 * the browser offers it, two or three short steps where it does not, and a way
 * out for the in-app browsers that cannot install anything at all.
 */
export default function InstallApp({
  copy,
  returnTo,
}: {
  copy: AuthCopy;
  returnTo?: string;
}) {
  const [view, setView] = useState<View>("ready");
  const [platform, setPlatform] = useState<Platform>("other");
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const [promptReady, setPromptReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const install = copy.install;
  const target = returnTo || "/login";

  useEffect(() => {
    if (isStandalone()) {
      window.location.replace(target);
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

    // Browser detection happens client-side; the server cannot identify the device.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(p);
    setView(initial);

    deferred.current = takeEarlyPrompt();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPromptReady(deferred.current !== null);

    let live = true;

    if (!deferred.current) {
      void isAppInstalled().then((installed) => {
        if (live && installed && !deferred.current) {
          setView("alreadyInstalled");
        }
      });
    }

    const onPrompt = (event: Event) => {
      deferred.current = event as BeforeInstallPromptEvent;
      setPromptReady(true);
      setView((current) =>
        current === "alreadyInstalled" ||
        current === "preparing" ||
        current === "manual"
          ? "ready"
          : current,
      );
    };

    const onInstalled = () => {
      deferred.current = null;
      setPromptReady(false);
      setView("installed");
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      live = false;
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [target]);

  async function installApp() {
    const prompt = deferred.current;

    if (!prompt) {
      setView("preparing");
      return;
    }

    setView("installing");

    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      deferred.current = null;
      setPromptReady(false);

      if (outcome !== "accepted") {
        setView("ready");
      }
    } catch {
      deferred.current = null;
      setPromptReady(false);
      setView("preparing");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard may be blocked by the current browser context.
    }
  }

  function chromeIntentUrl() {
    const { host, pathname, search } = window.location;
    return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
  }

  const stepsView: "ios" | "android" | "desktop" | null =
    view === "ios" || view === "inApp"
      ? "ios"
      : view === "manual"
        ? platform === "android"
          ? "android"
          : platform === "ios"
            ? "ios"
            : "desktop"
        : null;

  const showSteps =
    stepsView !== null &&
    view !== "installed" &&
    view !== "alreadyInstalled";

  const card =
    "rounded-3xl border border-border bg-surface/90 p-5 text-center shadow-card backdrop-blur sm:p-6";

  const primaryButton =
    "flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-primary px-5 py-3 text-base font-bold text-white shadow-lift transition duration-200 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-75";
  const secondaryButton =
    "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

  return (
    <main className="motion-safe-install relative flex min-h-[100svh] flex-col overflow-hidden bg-background">
      {/* Backdrop only: a fading dot field, three slowly drifting washes of
          brand light and one warm one. Nothing here is read or clicked. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute inset-0 bg-dots [mask-image:radial-gradient(65%_55%_at_50%_30%,black,transparent)]" />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2">
          <div className="install-drift size-[560px] rounded-full bg-primary-100/70 blur-[110px]" />
        </div>
        <div className="install-drift absolute -bottom-52 -right-28 size-[420px] rounded-full bg-primary-50 blur-[100px] [animation-delay:-6s]" />
        <div className="install-drift absolute -bottom-44 -left-32 size-[340px] rounded-full bg-gold/20 blur-[100px] [animation-delay:-12s]" />
      </div>

      <header className="relative flex items-center justify-between gap-4 px-5 pt-6 sm:px-8">
        <div className="flex items-center gap-2.5">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={36}
            height={36}
            priority
            className="size-9 rounded-xl object-contain ring-1 ring-border"
          />
          <span className="font-heading text-sm font-extrabold tracking-[0.2em] text-ink">
            STGT
          </span>
        </div>

        <LanguageToggle className="flex" />
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center px-5 py-10">
        <div className="install-rise w-full max-w-[400px]">
          <div className="flex flex-col items-center text-center">
            {/* The icon stage: the app card floats, rings ripple out from it as
                if it were landing on a home screen, and two chips hint at what
                installing gets you. */}
            <div className="relative grid place-items-center">
              <span
                aria-hidden="true"
                className="install-ring absolute size-32 rounded-full border border-primary/25 sm:size-40"
              />
              <span
                aria-hidden="true"
                className="install-ring absolute size-32 rounded-full border border-primary/20 [animation-delay:-2.4s] sm:size-40"
              />
              <span
                aria-hidden="true"
                className="install-ring absolute size-32 rounded-full border border-primary/15 [animation-delay:-4.8s] sm:size-40"
              />

              <div className="install-float relative rounded-[28px] bg-surface p-3 shadow-lift ring-1 ring-border">
                <Image
                  src="/icons/icon-192.png"
                  alt="STGT app icon"
                  width={80}
                  height={80}
                  priority
                  className="size-[76px] rounded-[20px] object-contain sm:size-[84px]"
                />
              </div>

              <span
                aria-hidden="true"
                className="install-float absolute -right-5 top-0 flex size-11 items-center justify-center rounded-2xl bg-surface shadow-card ring-1 ring-border [animation-delay:-2.5s] sm:-right-8"
              >
                <Bell className="size-5 text-primary" />
              </span>
              <span
                aria-hidden="true"
                className="install-float absolute -left-6 bottom-1 flex size-11 items-center justify-center rounded-2xl bg-surface shadow-card ring-1 ring-border [animation-delay:-4.5s] sm:-left-9"
              >
                <WifiOff className="size-5 text-success" />
              </span>
            </div>

            <h1 className="mt-7 font-heading text-[clamp(1.5rem,5vw,1.9rem)] font-extrabold leading-tight tracking-tight text-ink">
              {install.title}
            </h1>
            <span
              aria-hidden="true"
              className="mt-3 h-1.5 w-10 rounded-full bg-primary/70"
            />
          </div>

          <div className="install-rise mt-8 space-y-4 [animation-delay:180ms]">
            {(view === "ready" || view === "installing") && (
              <div className="space-y-3">
                {/* The one thing to do, so it gets the only glow on the page. */}
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-5 bottom-0 h-8 rounded-full bg-primary/30 blur-lg"
                  />
                  <button
                    type="button"
                    onClick={installApp}
                    disabled={view === "installing" || !promptReady}
                    aria-busy={view === "installing" || !promptReady}
                    className={`relative ${primaryButton}`}
                  >
                    {view === "installing" ? (
                      <>
                        <Loader2
                          className="size-5 shrink-0 animate-spin"
                          aria-hidden="true"
                        />
                        {install.installing}
                      </>
                    ) : promptReady ? (
                      <>
                        <Download
                          className="size-5 shrink-0"
                          aria-hidden="true"
                        />
                        {install.installButton}
                      </>
                    ) : (
                      <>
                        <Loader2
                          className="size-5 shrink-0 animate-spin"
                          aria-hidden="true"
                        />
                        {install.preparingTitle}
                      </>
                    )}
                  </button>
                </div>

                {!promptReady && view === "ready" && (
                  <p className="text-center text-xs leading-5 text-ink-muted">
                    {install.preparingMenu}
                  </p>
                )}
              </div>
            )}

            {view === "preparing" && (
              <div className={card}>
                <p className="flex items-center justify-center gap-2 font-heading text-base font-bold text-ink">
                  <Loader2
                    className="size-5 shrink-0 animate-spin text-primary"
                    aria-hidden="true"
                  />
                  {install.preparingTitle}
                </p>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  {install.preparingBody}
                </p>
                <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-ink-muted">
                  {install.preparingMenu}
                </p>
              </div>
            )}

            {view === "installed" && (
              <div className="space-y-3">
                <p className="flex items-center justify-center gap-2 rounded-2xl bg-success/10 px-4 py-3.5 text-sm font-semibold text-ink">
                  <Check
                    className="size-5 shrink-0 text-success"
                    aria-hidden="true"
                  />
                  {install.installed}
                </p>
                <Link href={target} className={primaryButton}>
                  <ExternalLink className="size-5 shrink-0" aria-hidden="true" />
                  {install.openApp}
                </Link>
              </div>
            )}

            {view === "alreadyInstalled" && (
              <div className="space-y-3">
                <div className={card}>
                  <p className="flex items-center justify-center gap-2 font-heading text-base font-bold text-ink">
                    <Check
                      className="size-5 shrink-0 text-success"
                      aria-hidden="true"
                    />
                    {install.alreadyInstalledTitle}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    {install.alreadyInstalledBody}
                  </p>
                </div>
                <Link href={target} className={primaryButton}>
                  <ExternalLink className="size-5 shrink-0" aria-hidden="true" />
                  {install.openApp}
                </Link>
              </div>
            )}

            {view === "inApp" && (
              <div className={card}>
                <h2 className="font-heading text-base font-bold text-ink">
                  {install.inAppTitle}
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  {install.inAppBody}
                </p>
                {platform === "android" && (
                  <a
                    href={chromeIntentUrl()}
                    className={`${primaryButton} mt-4`}
                  >
                    <ExternalLink
                      className="size-5 shrink-0"
                      aria-hidden="true"
                    />
                    {install.openInBrowser}
                  </a>
                )}
                <button
                  type="button"
                  onClick={copyLink}
                  className={`${secondaryButton} mt-3`}
                >
                  {copied ? (
                    <Check className="size-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4 shrink-0" aria-hidden="true" />
                  )}
                  {copied ? install.copied : install.copyLink}
                </button>
              </div>
            )}

            {showSteps && stepsView === "ios" && (
              <Steps title={install.iosTitle} note={install.iosSafariOnly}>
                <Step
                  n={1}
                  icon={<Share className="size-4" />}
                  text={install.iosStep1}
                />
                <Step
                  n={2}
                  icon={<SquarePlus className="size-4" />}
                  text={install.iosStep2}
                />
                <Step
                  n={3}
                  icon={<Check className="size-4" />}
                  text={install.iosStep3}
                />
              </Steps>
            )}

            {showSteps && stepsView === "android" && (
              <Steps title={install.androidTitle} note={null}>
                <Step
                  n={1}
                  icon={<Smartphone className="size-4" />}
                  text={install.androidStep1}
                />
                <Step
                  n={2}
                  icon={<Download className="size-4" />}
                  text={install.androidStep2}
                />
              </Steps>
            )}

            {showSteps && stepsView === "desktop" && (
              <Steps title={install.desktopTitle} note={null}>
                <Step
                  n={1}
                  icon={<Monitor className="size-4" />}
                  text={install.desktopStep1}
                />
                <Step
                  n={2}
                  icon={<Download className="size-4" />}
                  text={install.desktopStep2}
                />
              </Steps>
            )}

            {view === "manual" && (
              <div className={card}>
                <h2 className="font-heading text-base font-bold text-ink">
                  {install.manualTitle}
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  {install.manualBody}
                </p>
              </div>
            )}
          </div>

          {view !== "installed" && view !== "alreadyInstalled" && (
            <p className="install-rise mt-6 text-center text-sm [animation-delay:260ms]">
              <Link
                href="/login"
                className="font-medium text-ink-muted underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {install.continueInBrowser}
              </Link>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function Steps({
  title,
  note,
  children,
}: {
  title: string;
  note: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-surface/90 p-5 text-left shadow-card backdrop-blur sm:p-6">
      {/* A wash of brand light across the top edge, so the sheet does not sit
          flat on the page. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary-50/80 to-transparent"
      />
      <h2 className="relative text-center font-heading text-base font-bold text-ink">
        {title}
      </h2>
      <ol className="relative mt-4 space-y-3.5">
        {/* The thread that ties the numbered circles into one instruction. */}
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-[13px] top-2 w-px bg-border"
        />
        {children}
      </ol>
      {note && (
        <p className="relative mt-4 border-t border-border pt-3 text-center text-xs leading-5 text-ink-muted">
          {note}
        </p>
      )}
    </section>
  );
}

function Step({
  n,
  icon,
  text,
}: {
  n: number;
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <li className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-50 font-heading text-xs font-bold text-primary ring-4 ring-surface/90"
      >
        {n}
      </span>
      <span className="min-w-0 flex-1 text-sm leading-6 text-ink">{text}</span>
      <span className="shrink-0 text-primary">{icon}</span>
    </li>
  );
}
