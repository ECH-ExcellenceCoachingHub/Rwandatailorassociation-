import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import LoginForm from "@/components/auth/LoginForm";
import { lookupQrToken } from "@/lib/auth/qr-access";
import { getDashboardCopy } from "@/lib/i18n/server";
import { LanguageToggle } from "@/components/ui/language-toggle";
import {
  RATE_LIMITS,
  checkRateLimit,
  getClientIp,
  getUserAgent,
  rateLimitKey,
} from "@/lib/api/rate-limit";

/**
 * /qr/:token — where a scanned sign-in QR card lands.
 *
 * It does NOT sign anyone in. It checks the card and, if it is live, asks for
 * the owner's password — the same bare screen as the admin-shared sign-in link
 * at /in/:token. The session is made by /api/auth/qr-login once the password
 * is right, so a card found on a workbench opens nothing by itself.
 *
 * ON THE TOKEN BEING IN A URL. It is, and it therefore lands in browser
 * history the same way an emailed link does. With a password still required
 * that costs little; it is further bounded by the code's expiry, by one-click
 * regeneration, and by `Referrer-Policy: strict-origin-when-cross-origin` in
 * middleware.ts, which keeps the path out of outbound Referer headers.
 */

// Checking a card must never be served from a cache.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.auth.login.title} | STGT`,
    robots: { index: false, follow: false },
  };
}

export default async function QrSignInPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ip = await getClientIp();
  const userAgent = await getUserAgent();

  // Keyed by address rather than by code: an attacker guessing at tokens has
  // no account to be keyed against, and rationing their attempts is the whole
  // point. The budget is generous enough that a workshop behind one connection
  // is not locked out by ordinary use.
  const limit = checkRateLimit(rateLimitKey("qr-scan", ip), RATE_LIMITS.QR_SCAN);
  if (!limit.allowed) redirect("/qr-invalid?reason=throttled");

  const code = await lookupQrToken(token, { ipAddress: ip, userAgent });

  // One destination for every failure. Telling the holder of a card whether
  // it is unknown, expired or revoked tells a stranger whether they have found
  // a real one; the page covers all three cases in words the owner can act on.
  if (!code.ok) redirect("/qr-invalid");

  const { d } = await getDashboardCopy();
  const copy = d.auth.login;
  const initials = code.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-hidden bg-footer">
      {/* Backdrop: the sign-in panel's navy, dot texture and glow, plus the
          swoosh from the printed card along the bottom, so the page someone
          lands on after scanning looks like the card in their hand. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(31,74,136,0.55),transparent_60%)]" />
        <div className="absolute inset-0 bg-noise opacity-40" />
        <div className="absolute -left-32 -top-32 size-[420px] rounded-full bg-primary-light/25 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 size-[480px] rounded-full bg-primary/60 blur-3xl" />
        <svg
          className="absolute inset-x-0 bottom-0 h-[38vh] w-full"
          viewBox="0 0 1440 400"
          preserveAspectRatio="none"
        >
          <path
            d="M0 260C240 180 420 330 720 250C1020 170 1200 60 1440 110V400H0Z"
            fill="rgba(141,180,227,0.10)"
          />
          <path
            d="M0 320C300 240 520 380 820 300C1080 230 1260 170 1440 200V400H0Z"
            fill="rgba(31,74,136,0.45)"
          />
          <path
            d="M0 300C300 220 520 360 820 280C1080 210 1260 150 1440 180"
            fill="none"
            stroke="rgba(141,180,227,0.35)"
            strokeWidth="2"
          />
        </svg>
      </div>

      <header className="flex items-center justify-end px-5 pt-5 sm:px-8 sm:pt-6">
        <LanguageToggle className="flex border-white/15 bg-white/95 shadow-lg shadow-black/10" />
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-[440px] animate-status-rise">
          <h1 className="sr-only">{copy.title}</h1>

          {/* Brand lockup, above the sheet. */}
          <div className="mb-7 flex flex-col items-center text-center">
            <Image
              src="/images/rtalogo.jpg"
              alt=""
              width={88}
              height={88}
              priority
              className="size-[76px] rounded-full object-cover shadow-xl shadow-black/30 ring-4 ring-white/15 sm:size-[88px]"
            />
            <span className="mt-4 block font-heading text-[30px] font-bold leading-none tracking-[0.08em] text-white">
              STGT
            </span>
            <span className="mt-2 block font-heading text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-light">
              {d.auth.layout.brandTagline}
            </span>
          </div>

          <section className="rounded-[28px] bg-surface p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)] ring-1 ring-white/10 sm:p-8">
            {/* Whose card this is — the printed card already says so. */}
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="flex size-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-footer font-heading text-lg font-semibold tracking-wide text-white shadow-md shadow-primary/30"
              >
                {initials}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  {copy.qrWelcome}
                </p>
                <p className="truncate font-heading text-xl font-semibold text-ink">
                  {code.fullName}
                </p>
              </div>
            </div>

            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/15">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              {copy.qrCardVerified}
            </p>

            <div className="my-6 h-px bg-border" />

            <p className="mb-5 text-[15px] leading-relaxed text-ink-muted">{copy.qrPrompt}</p>

            {/* useSearchParams needs a Suspense boundary to keep the shell static. */}
            <Suspense fallback={<div className="h-40" />}>
              <LoginForm qrToken={token} />
            </Suspense>

            <p className="mt-6 flex items-start gap-2 rounded-xl bg-primary-50 px-3.5 py-3 text-xs leading-relaxed text-primary">
              <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden="true" />
              {copy.qrSecure}
            </p>
          </section>

          <p className="mt-8 text-center text-xs text-white/45">
            © {new Date().getFullYear()} Rwanda Tailors Association
          </p>
        </div>
      </div>
    </main>
  );
}
