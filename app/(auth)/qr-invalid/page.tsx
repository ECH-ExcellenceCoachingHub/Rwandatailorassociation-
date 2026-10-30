import type { Metadata } from "next";
import Link from "next/link";
import { QrCode } from "lucide-react";
import { getDashboardCopy } from "@/lib/i18n/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Where a scan lands when the code does not work.
 *
 * One page for every failure — unknown, expired, revoked, or belonging to a
 * suspended account. Distinguishing them here would tell whoever is holding
 * the card whether they have found a real one, which is precisely the thing
 * not to tell a stranger who picked it up off a bench.
 *
 * `throttled` is the exception, and safely so: it describes the visitor's own
 * connection rather than anybody's code, and without it a member scanning
 * twice in a busy workshop is told their card is broken when it is not.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.account.qrInvalid.title,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default async function QrInvalidPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  const { d } = await getDashboardCopy();
  const copy = d.account.qrInvalid;

  const throttled = params.reason === "throttled";

  return (
    <div>
      <span className="flex size-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 sm:size-14">
        <QrCode className="size-6 sm:size-7" aria-hidden="true" />
      </span>

      <h1 className="mt-5 font-heading text-2xl font-bold text-ink sm:mt-6 sm:text-3xl">
        {throttled ? copy.throttledTitle : copy.title}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
        {throttled ? copy.throttledBody : copy.body}
      </p>

      {!throttled && (
        <Alert variant="info" className="mt-6">
          {copy.whatToDo}
        </Alert>
      )}

      <Button asChild className="mt-7 w-full sm:mt-8">
        <Link href="/login">{copy.signIn}</Link>
      </Button>

      <p className="mt-6 text-center text-sm text-ink-muted">{copy.help}</p>
    </div>
  );
}
