import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { add, toMoneyString } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { EmptyState } from "@/components/ui/empty-state";
import { LoanApplicationReview } from "@/components/dashboard/LoanApplicationReview";
import { approvalCeiling } from "@/lib/services/loans";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.admin.applications.title} | RTA`,
  };
}

export const dynamic = "force-dynamic";

export default async function LoanApplicationsPage() {
  const context = await requirePermission(
    PERMISSIONS.LOANS_REVIEW,
    "/admin/loans/applications"
  );

  const associationId = resolveAssociationScope(context);
  const scope = associationId ? { associationId } : {};
  const { d } = await getDashboardCopy();
  const copy = d.admin.applications;

  const [applications, pendingDisbursement] = await Promise.all([
    prisma.loanApplication.findMany({
      where: {
        ...scope,
        status: { in: ["SUBMITTED", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"] },
      },
      orderBy: { submittedAt: "asc" },
      take: 100,
      select: {
        id: true,
        reference: true,
        status: true,
        requestedAmount: true,
        purpose: true,
        termMonths: true,
        frequency: true,
        associationId: true,
        savingsAtApplication: true,
        maxEligibleAmount: true,
        eligibilityReport: true,
        submittedAt: true,
        loanProduct: {
          select: { name: true, interestRate: true, interestMethod: true },
        },
        member: {
          select: {
            id: true,
            memberNumber: true,
            joinedAt: true,
            user: { select: { firstName: true, lastName: true, phone: true } },
            savingsAccounts: {
              where: { isActive: true },
              take: 1,
              select: { balance: true, totalDeposits: true },
            },
            loans: {
              where: { status: { in: ["ACTIVE", "DISBURSED", "OVERDUE", "COMPLETED"] } },
              select: {
                status: true,
                principalOutstanding: true,
                interestOutstanding: true,
                feesOutstanding: true,
                penaltyOutstanding: true,
                daysOverdue: true,
              },
            },
          },
        },
        guarantors: {
          orderBy: { createdAt: "asc" },
          select: {
            fullName: true,
            phone: true,
            status: true,
            guaranteedAmount: true,
            guarantorMember: { select: { memberNumber: true } },
          },
        },
      },
    }),

    // Approved loans still awaiting the money going out.
    prisma.loan.findMany({
      where: { ...scope, status: "PENDING_DISBURSEMENT" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        reference: true,
        principal: true,
        interestRate: true,
        termMonths: true,
        frequency: true,
        createdAt: true,
        loanProduct: { select: { name: true } },
        member: {
          select: {
            memberNumber: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
  ]);

  // What each application is secured up to, by the same function the server
  // enforces on approve, so the figure the reviewer sees is the figure that
  // binds. Few applications await review at once, so one call each is fine.
  const ceilings = await Promise.all(
    applications.map((a) => approvalCeiling(prisma, a))
  );

  const canApprove = context.permissions.has(PERMISSIONS.LOANS_APPROVE);
  const canReject = context.permissions.has(PERMISSIONS.LOANS_REJECT);
  const canDisburse = context.permissions.has(PERMISSIONS.LOANS_DISBURSE);

  if (applications.length === 0 && pendingDisbursement.length === 0) {
    return (
      <div>
        <PageHeader title={copy.title} />
        <EmptyState
          icon={ClipboardList}
          title={copy.noneTitle}
          description={copy.noneBody}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={copy.title} description={copy.description} />

      <LoanApplicationReview
        applications={applications.map((a, index) => {
          const account = a.member.savingsAccounts[0];
          const ceiling = ceilings[index];
          const activeLoans = a.member.loans.filter((l) => l.status !== "COMPLETED");

          return {
            id: a.id,
            reference: a.reference,
            status: a.status,
            requestedAmount: a.requestedAmount.toFixed(2),
            purpose: a.purpose,
            termMonths: a.termMonths,
            frequency: a.frequency,
            submittedAt: a.submittedAt,
            productName: a.loanProduct.name,
            interestRate: a.loanProduct.interestRate.toFixed(2),
            interestMethod: a.loanProduct.interestMethod,
            memberId: a.member.id,
            memberName: `${a.member.user.firstName} ${a.member.user.lastName}`.trim(),
            memberNumber: a.member.memberNumber,
            memberPhone: a.member.user.phone,
            memberSince: a.member.joinedAt,
            // The reviewer's key evidence: what the member has saved, what they
            // already owe, and whether they are current on it.
            savingsBalance: account?.balance.toFixed(2) ?? "0.00",
            lifetimeDeposits: account?.totalDeposits.toFixed(2) ?? "0.00",
            savingsAtApplication: a.savingsAtApplication?.toFixed(2) ?? null,
            maxEligibleAmount: a.maxEligibleAmount?.toFixed(2) ?? null,
            existingLoanCount: activeLoans.length,
            existingOutstanding: toMoneyString(
              activeLoans.reduce(
                (sum, l) =>
                  add(
                    sum,
                    l.principalOutstanding,
                    l.interestOutstanding,
                    l.feesOutstanding,
                    l.penaltyOutstanding
                  ),
                add(0)
              )
            ),
            hasOverdueHistory: a.member.loans.some((l) => l.daysOverdue > 0),
            completedLoans: a.member.loans.filter((l) => l.status === "COMPLETED").length,
            guarantors: a.guarantors.map((g) => ({
              fullName: g.fullName,
              phone: g.phone,
              status: g.status,
              memberNumber: g.guarantorMember?.memberNumber ?? null,
              amount: g.guaranteedAmount?.toFixed(2) ?? null,
            })),
            secured: ceiling
              ? {
                  upTo: ceiling.amount,
                  ownShare: ceiling.ownShare,
                  accepted: ceiling.accepted,
                  collateral: ceiling.collateral,
                  pendingCount: ceiling.pendingCount,
                }
              : null,
          };
        })}
        pendingDisbursement={pendingDisbursement.map((l) => ({
          id: l.id,
          reference: l.reference,
          principal: l.principal.toFixed(2),
          interestRate: l.interestRate.toFixed(2),
          termMonths: l.termMonths,
          frequency: l.frequency,
          productName: l.loanProduct.name,
          memberName: `${l.member.user.firstName} ${l.member.user.lastName}`.trim(),
          memberNumber: l.member.memberNumber,
          approvedAt: l.createdAt,
        }))}
        canApprove={canApprove}
        canReject={canReject}
        canDisburse={canDisburse}
      />
    </div>
  );
}
