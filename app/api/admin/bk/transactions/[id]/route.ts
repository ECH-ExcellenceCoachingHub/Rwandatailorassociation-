import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiPermission } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiNotFound, apiSuccess, withErrorHandling } from "@/lib/api/response";
import { toMoneyString } from "@/lib/money";

export const GET = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireApiPermission(PERMISSIONS.BK_VIEW);
    const { id } = await params;

    const tx = await prisma.bkTransaction.findUnique({
      where: { id },
      include: {
        matchedMember: {
          select: {
            id: true,
            memberNumber: true,
            paymentReference: true,
            user: { select: { firstName: true, lastName: true, phone: true } },
            savingsAccounts: {
              where: { isActive: true },
              take: 1,
              select: { id: true, accountNumber: true },
            },
          },
        },
        matchedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        reconciliations: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            attempt: true,
            outcome: true,
            strategy: true,
            confidence: true,
            candidateIds: true,
            resolvedMemberId: true,
            notes: true,
            errorMessage: true,
            performedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
            createdAt: true,
          },
        },
      },
    });

    if (!tx) {
      return apiNotFound("Transaction not found");
    }

    const maskedPayerAccount = tx.payerAccount
      ? tx.payerAccount.slice(0, 4) + "***" + tx.payerAccount.slice(-4)
      : null;
    const maskedPayeeAccount = tx.payeeAccount
      ? tx.payeeAccount.slice(0, 4) + "***" + tx.payeeAccount.slice(-4)
      : null;
    const maskedDebitedAccount = tx.debitedAccount
      ? tx.debitedAccount.slice(0, 4) + "***" + tx.debitedAccount.slice(-4)
      : null;
    const maskedCreditedAccount = tx.creditedAccount
      ? tx.creditedAccount.slice(0, 4) + "***" + tx.creditedAccount.slice(-4)
      : null;

    return apiSuccess({
      id: tx.id,
      bkTransactionId: tx.bkTransactionId,
      bkClientReference: tx.bkClientReference,
      bkTransactionReference: tx.bkTransactionReference,
      bkPaymentCode: tx.bkPaymentCode,
      bkExtrasClientReference: tx.bkExtrasClientReference,
      amount: toMoneyString(tx.amount),
      currency: tx.currency,
      bkStatus: tx.bkStatus,
      bkExtrasStatus: tx.bkExtrasStatus,
      payerNames: tx.payerNames,
      payerAccount: maskedPayerAccount,
      payerContact: tx.payerContact,
      payeeNames: tx.payeeNames,
      payeeAccount: maskedPayeeAccount,
      beneficiaryNames: tx.beneficiaryNames,
      beneficiaryBank: tx.beneficiaryBank,
      beneficiaryBankCode: tx.beneficiaryBankCode,
      narration: tx.narration,
      serviceCode: tx.serviceCode,
      transferType: tx.transferType,
      sourceChannel: tx.sourceChannel,
      transactionStage: tx.transactionStage,
      transactionStatus: tx.transactionStatus,
      transactionStatusComment: tx.transactionStatusComment,
      digitalProfileId: tx.digitalProfileId,
      debitedAccount: maskedDebitedAccount,
      debitedAccountOwnerNames: tx.debitedAccountOwnerNames,
      creditedAccount: maskedCreditedAccount,
      creditedAccountOwnerNames: tx.creditedAccountOwnerNames,
      debitCurrency: tx.debitCurrency,
      creditCurrency: tx.creditCurrency,
      transactionDate: tx.transactionDate,
      createdDate: tx.createdDate,
      updatedDate: tx.updatedDate,
      reconciliationStatus: tx.reconciliationStatus,
      matchStrategy: tx.matchStrategy,
      matchConfidence: tx.matchConfidence,
      matchReason: tx.matchReason,
      importedAt: tx.importedAt,
      lastSyncedAt: tx.lastSyncedAt,
      syncError: tx.syncError,
      syncErrorCode: tx.syncErrorCode,
      isReversal: tx.isReversal,
      member: tx.matchedMember
        ? {
            id: tx.matchedMember.id,
            memberNumber: tx.matchedMember.memberNumber,
            paymentReference: tx.matchedMember.paymentReference,
            fullName: `${tx.matchedMember.user.firstName} ${tx.matchedMember.user.lastName}`.trim(),
            phone: tx.matchedMember.user.phone,
            savingsAccount: tx.matchedMember.savingsAccounts[0]
              ? {
                  id: tx.matchedMember.savingsAccounts[0].id,
                  accountNumber: tx.matchedMember.savingsAccounts[0].accountNumber,
                }
              : null,
          }
        : null,
      matchedBy: tx.matchedBy
        ? {
            id: tx.matchedBy.id,
            fullName: `${tx.matchedBy.firstName} ${tx.matchedBy.lastName}`.trim(),
            email: tx.matchedBy.email,
          }
        : null,
      matchedAt: tx.matchedAt,
      reconciliations: tx.reconciliations.map((r) => ({
        id: r.id,
        attempt: r.attempt,
        outcome: r.outcome,
        strategy: r.strategy,
        confidence: r.confidence,
        candidateIds: r.candidateIds,
        resolvedMemberId: r.resolvedMemberId,
        notes: r.notes,
        errorMessage: r.errorMessage,
        performedBy: r.performedBy
          ? {
              id: r.performedBy.id,
              fullName: `${r.performedBy.firstName} ${r.performedBy.lastName}`.trim(),
            }
          : null,
        createdAt: r.createdAt,
      })),
      rawPayload: tx.rawPayload,
    });
  }
);
