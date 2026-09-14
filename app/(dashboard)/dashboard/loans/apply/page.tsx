import type { Metadata } from "next";
import Link from "next/link";
import { HandCoins } from "lucide-react";
import { requireMember } from "@/lib/auth/guards";
import { getAvailableLoanProducts } from "@/lib/services/member-queries";
import { getDashboardCopy } from "@/lib/i18n/server";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { LoanApplicationForm } from "@/components/dashboard/LoanApplicationForm";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.member.apply.title} | RTA`,
  };
}

export const dynamic = "force-dynamic";

export default async function LoanApplyPage() {
  const context = await requireMember("/dashboard/loans/apply");
  const { d } = await getDashboardCopy();
  const copy = d.member.apply;

  const data = await getAvailableLoanProducts(
    context.member!.id,
    context.user.associationId!
  );

  if (data.products.length === 0) {
    return (
      <EmptyState
        icon={HandCoins}
        title={copy.noProductsTitle}
        description={copy.noProductsBody}
      />
    );
  }

  // The rulebook's ACTIVE_LOAN blocker is unconditional — "You already have a
  // loan running. It must be finished before you take another." This used to
  // be gated on every product opting into `singleActiveLoan`, so a product
  // that did not would let the member onto a form the server then refused.
  if (data.hasActiveLoan) {
    return (
      <div>
        <PageHeader title={copy.title} />
        <EmptyState
          icon={HandCoins}
          title={copy.activeLoanTitle}
          description={copy.activeLoanBody}
          action={
            <Button asChild variant="outline">
              <Link href="/dashboard/loans">{copy.viewMyLoan}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={copy.title} description={copy.description} />

      <LoanApplicationForm
        products={data.products}
        policy={data.policy}
        savingsBalance={data.savingsBalance}
        membershipMonths={data.membershipMonths}
        associationMonths={data.associationMonths}
        missedDays={data.missedDays}
        outstandingFines={data.outstandingFines}
        hasActiveLoan={data.hasActiveLoan}
      />
    </div>
  );
}
