import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  apiSuccess,
  paginated,
  withErrorHandling,
} from "@/lib/api/response";
import { toMoneyString } from "@/lib/money";

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["UNMATCHED", "MATCHED", "MANUALLY_MATCHED", "COMPLETED", "FAILED", "PENDING"]).optional(),
  search: z.string().optional(),
});

export const GET = withErrorHandling(
  async (request: NextRequest) => {
    const context = await requireApiPermission(PERMISSIONS.BK_VIEW);

    // This is a collection route with no [id] segment, so there are no params
    // to read an association out of. The scope comes from the caller: an
    // association admin sees their own transactions, a platform admin sees
    // all of them. Reading a non-existent param left the scope empty and
    // listed every association's transactions to everyone.
    const associationId = resolveAssociationScope(context);
    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));

    const scope = associationId ? { associationId } : {};

    const where: Record<string, unknown> = { ...scope };

    if (query.status) {
      if (query.status === "PENDING") {
        where.bkExtrasStatus = "PENDING";
      } else {
        where.reconciliationStatus = query.status;
      }
    }

    if (query.search) {
      where.OR = [
        { bkTransactionId: { contains: query.search, mode: "insensitive" } },
        { bkPaymentCode: { contains: query.search, mode: "insensitive" } },
        { payerNames: { contains: query.search, mode: "insensitive" } },
        { payerContact: { contains: query.search, mode: "insensitive" } },
        { narration: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [total, transactions] = await Promise.all([
      prisma.bkTransaction.count({ where }),
      prisma.bkTransaction.findMany({
        where,
        orderBy: { transactionDate: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          bkTransactionId: true,
          bkPaymentCode: true,
          amount: true,
          currency: true,
          bkStatus: true,
          bkExtrasStatus: true,
          payerNames: true,
          payerAccount: true,
          payerContact: true,
          payeeNames: true,
          narration: true,
          transactionDate: true,
          reconciliationStatus: true,
          matchStrategy: true,
          matchConfidence: true,
          matchedMemberId: true,
          matchedMember: {
            select: {
              id: true,
              memberNumber: true,
              paymentReference: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
          createdDate: true,
          importedAt: true,
          lastSyncedAt: true,
        },
      }),
    ]);

    const items = transactions.map((tx) => ({
      id: tx.id,
      bkTransactionId: tx.bkTransactionId,
      bkPaymentCode: tx.bkPaymentCode,
      amount: toMoneyString(tx.amount),
      currency: tx.currency,
      bkStatus: tx.bkStatus,
      bkExtrasStatus: tx.bkExtrasStatus,
      payerNames: tx.payerNames,
      payerAccount: maskAccountNumber(tx.payerAccount),
      payerContact: tx.payerContact,
      payeeNames: tx.payeeNames,
      narration: tx.narration,
      transactionDate: tx.transactionDate,
      reconciliationStatus: tx.reconciliationStatus,
      matchStrategy: tx.matchStrategy,
      matchConfidence: tx.matchConfidence,
      member: tx.matchedMember
        ? {
            id: tx.matchedMember.id,
            memberNumber: tx.matchedMember.memberNumber,
            fullName: `${tx.matchedMember.user.firstName} ${tx.matchedMember.user.lastName}`.trim(),
          }
        : null,
      createdDate: tx.createdDate,
      importedAt: tx.importedAt,
      lastSyncedAt: tx.lastSyncedAt,
    }));

    return apiSuccess(paginated(items, total, query.page, query.pageSize));
  }
);

function maskAccountNumber(account: string | null): string | null {
  if (!account) return null;
  if (account.length <= 6) return account;
  return account.slice(0, 4) + "***" + account.slice(-4);
}
