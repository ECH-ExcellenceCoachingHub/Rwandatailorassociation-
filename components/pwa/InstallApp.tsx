"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Monitor,
  Share,
  Smartphone,
  SquarePlus,
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
 * It used to render inside the (auth) shell, which repeated the navy brand
 * panel and the STGT lockup around a card that already had both. It now owns
 * its own layout: the brand fills the viewport beside the instructions on a
 * desktop, and on a phone the same navy becomes a header above a rounded
 * sheet — so the page is never a card floating in someone else's frame.
 *
 * The language switch travels with it, because the (auth) layout is what used
 * to provide it.
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
  const [supported, setSupported] = useState<boolean | null>(null);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const [promptReady, setPromptReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const install = copy.install;
  const layout = copy.layout;
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
    setSupported(canPrompt || p === "ios");
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
  const showPreview = view !== "inApp";

  const primaryButton =
    "flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-primary px-5 py-3 text-base font-bold text-white shadow-lift transition duration-200 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-75";
  const secondaryButton =
    "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

  return (
    <main className="flex min-h-[100svh] w-full flex-col bg-footer lg:grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      {/* Brand panel: beside the instructions on a desktop, a header above them on a phone. */}
      <section className="relative isolate flex flex-col overflow-hidden bg-footer px-5 pb-10 pt-6 text-white sm:px-8 lg:min-h-[100svh] lg:justify-between lg:px-12 lg:py-10 xl:px-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-noise opacity-40"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 -z-10 size-72 rounded-full border border-white/10 sm:size-96"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-24 -z-10 size-80 rounded-full border border-white/10"
        />

        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/icons/icon-192.png"
              alt="Rwanda Tailors Association"
              width={56}
              height={56}
              priority
              className="size-12 shrink-0 rounded-full bg-white object-contain p-1 shadow-lg ring-1 ring-white/30 sm:size-14"
            />
            <div className="min-w-0 text-left">
              <p className="font-heading text-xl font-extrabold tracking-[0.08em] sm:text-2xl">
                STGT
              </p>
              <p className="mt-1 text-[10px] font-bold leading-snug tracking-[0.16em] text-primary-light sm:text-xs">
                {layout.brandTagline}
              </p>
            </div>
          </div>

          <LanguageToggle className="flex border-white/20 bg-white/95 shadow-lg shadow-black/20" />
        </div>

        <div className="mt-9 lg:mt-0">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-light sm:text-xs">
            Rwanda Tailors Association
          </p>
          <h2 className="font-heading text-balance text-[clamp(1.75rem,7vw,2.5rem)] font-extrabold leading-tight tracking-tight text-white lg:text-[clamp(2rem,3.2vw,3.25rem)]">
            {layout.headline}
          </h2>
          <p className="mt-5 hidden max-w-md text-sm leading-7 text-white/70 sm:block lg:text-base">
            {install.pageIntro}
          </p>
        </div>

        <p className="mt-10 hidden text-xs text-white/40 lg:mt-12 lg:block">
          © {new Date().getFullYear()} Rwanda Tailors Association
        </p>
      </section>

      {/* Install content */}
      <section className="flex flex-1 flex-col justify-center rounded-t-[32px] bg-background px-5 py-9 sm:px-8 lg:rounded-none lg:px-12 lg:py-14 xl:px-16">
        <div className="mx-auto w-full max-w-lg">
          <div className="flex flex-col items-center text-center">
            {showPreview && (
              <div className="mb-5 rounded-3xl bg-surface p-2 shadow-card ring-1 ring-border">
                <Image
                  src="/icons/icon-192.png"
                  alt="STGT app icon"
                  width={76}
                  height={76}
                  priority
                  className="size-16 rounded-[18px] object-contain sm:size-[76px]"
                />
              </div>
            )}

            <h1 className="max-w-[18ch] font-heading text-balance text-[clamp(1.6rem,4.5vw,2.25rem)] font-extrabold leading-tight tracking-tight text-ink">
              {install.title}
            </h1>

            <p className="mt-3 max-w-[42ch] text-pretty text-sm leading-6 text-ink-muted sm:text-base sm:leading-7">
              {install.subtitle}
            </p>

            {supported !== null &&
              view !== "installed" &&
              view !== "alreadyInstalled" && (
                <p
                  className={`mt-5 flex max-w-full items-start justify-center gap-2 text-xs font-medium leading-5 sm:text-sm ${
                    supported ? "text-success" : "text-ink-muted"
                  }`}
                >
                  {supported ? (
                    <Check
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <Info
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <span>{supported ? install.supported : install.notSupported}</span>
                </p>
              )}
          </div>

          <div className="mt-7 space-y-4 sm:mt-8">
            {view === "alreadyInstalled" && (
              <div className="rounded-2xl border border-success/20 bg-success/10 px-4 py-4">
                <p className="flex items-center justify-center gap-2 font-heading text-base font-semibold text-ink">
                  <Check
                    className="size-5 shrink-0 text-success"
                    aria-hidden="true"
                  />
                  {install.alreadyInstalledTitle}
                </p>
                <p className="mt-1.5 text-center text-sm leading-relaxed text-ink-muted">
                  {install.alreadyInstalledBody}
                </p>
              </div>
            )}

            {(view === "ready" || view === "installing") && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={installApp}
                  disabled={view === "installing" || !promptReady}
                  aria-busy={view === "installing" || !promptReady}
                  className={primaryButton}
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
                      <Download className="size-5 shrink-0" aria-hidden="true" />
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

                {!promptReady && view === "ready" && (
                  <p className="text-center text-xs leading-5 text-ink-muted">
                    {install.preparingMenu}
                  </p>
                )}
              </div>
            )}

            {view === "preparing" && (
              <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
                <div>
                  <p className="flex items-center justify-center gap-2 font-heading text-base font-semibold text-ink">
                    <Loader2
                      className="size-5 shrink-0 animate-spin text-primary"
                      aria-hidden="true"
                    />
                    {install.preparingTitle}
                  </p>
                  <p className="mt-2 text-center text-sm leading-relaxed text-ink-muted">
                    {install.preparingBody}
                  </p>
                </div>
                <p className="border-t border-border pt-4 text-center text-sm leading-relaxed text-ink-muted">
                  {install.preparingMenu}
                </p>
              </div>
            )}

            {view === "installed" && (
              <p className="flex items-center justify-center gap-2 rounded-2xl bg-success/10 px-4 py-3 text-sm font-medium text-ink">
                <Check
                  className="size-5 shrink-0 text-success"
                  aria-hidden="true"
                />
                {install.installed}
              </p>
            )}

            {view === "inApp" && (
              <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 text-left shadow-card">
                <h2 className="font-heading text-base font-bold text-ink">
                  {install.inAppTitle}
                </h2>
                <p className="text-sm leading-relaxed text-ink-muted">
                  {install.inAppBody}
                </p>
                {platform === "android" && (
                  <a
                    href={chromeIntentUrl()}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lift transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
                  >
                    <ExternalLink
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    />
                    {install.openInBrowser}
                  </a>
                )}
                <button
                  type="button"
                  onClick={copyLink}
                  className={secondaryButton}
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
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
                <h2 className="font-heading text-base font-bold text-ink">
                  {install.manualTitle}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {install.manualBody}
                </p>
              </div>
            )}

            {(view === "installed" || view === "alreadyInstalled") && (
              <Link href={target} className={primaryButton}>
                <ExternalLink className="size-5 shrink-0" aria-hidden="true" />
                {install.openApp}
              </Link>
            )}
          </div>

          {view !== "installed" && view !== "alreadyInstalled" && (
            <p className="mt-6 text-center text-sm leading-6 text-ink-muted">
              <Link
                href="/login"
                className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {install.continueInBrowser}
              </Link>
            </p>
          )}

          {/* On a desktop the brand panel carries the copyright; here it would
              be the second copy of it on one screen. */}
          <p className="mt-8 text-center text-xs leading-5 text-ink-muted/70 lg:hidden">
            © {new Date().getFullYear()} Rwanda Tailors Association · STGT
          </p>
        </div>
      </section>
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
    <section className="rounded-2xl border border-border bg-surface p-4 text-left shadow-card sm:p-5">
      <h2 className="font-heading text-base font-bold text-ink sm:text-lg">
        {title}
      </h2>
      <ol className="mt-4 space-y-4 text-sm text-ink">{children}</ol>
      {note && (
        <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-ink-muted">
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
    <li className="flex min-w-0 items-start gap-3">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-50 font-heading text-sm font-bold text-primary"
      >
        {n}
      </span>
      <span className="min-w-0 flex-1 break-words leading-relaxed">{text}</span>
      <span className="shrink-0 pt-1 text-primary">{icon}</span>
    </li>
  );
}
