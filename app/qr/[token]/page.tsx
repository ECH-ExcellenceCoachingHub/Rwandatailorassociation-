import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { lookupQrToken } from "@/lib/auth/qr-access";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/fill";
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

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[380px]">
        <h1 className="sr-only">{d.auth.login.title}</h1>

        {/* The same lockup as the sign-in page on a phone. */}
        <div className="mb-10 flex items-center gap-4">
          <Image
            src="/images/rtalogo.jpg"
            alt=""
            width={80}
            height={80}
            className="size-20 shrink-0 rounded-full object-cover"
          />
          <span className="leading-tight">
            <span className="block font-heading text-[32px] font-bold tracking-[0.06em] text-ink">
              STGT
            </span>
            <span className="mt-1 block font-heading text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
              {d.auth.layout.brandTagline}
            </span>
          </span>
        </div>

        <p className="mb-6 text-[15px] leading-relaxed text-ink-muted">
          {fill(d.auth.login.qrSignInAs, { name: code.fullName })}
        </p>

        {/* useSearchParams needs a Suspense boundary to keep the shell static. */}
        <Suspense fallback={<div className="h-56" />}>
          <LoginForm qrToken={token} />
        </Suspense>
      </div>
    </main>
  );
}
