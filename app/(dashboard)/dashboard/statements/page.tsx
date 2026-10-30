import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { requireMember } from "@/lib/auth/guards";
import { getDashboardCopy } from "@/lib/i18n/server";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatementDownload } from "@/components/dashboard/StatementDownload";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: d.member.statements.title,
  };
}

export const dynamic = "force-dynamic";

export default async function StatementsPage() {
  const context = await requireMember("/dashboard/statements");
  const { d } = await getDashboardCopy();
  const copy = d.member.statements;

  return (
    <div className="max-w-2xl">
      <PageHeader title={copy.title} description={copy.description} />

      <StatementDownload
        memberNumber={context.member!.memberNumber}
        paymentReference={context.member!.paymentReference}
      />

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-surface p-5">
        <FileText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="text-sm leading-relaxed text-ink-muted">
          <p>{copy.ledgerNote}</p>
          <p className="mt-2">{copy.formatNote}</p>
        </div>
      </div>
    </div>
  );
}
