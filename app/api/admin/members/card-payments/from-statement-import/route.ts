import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { apiBadRequest, apiSuccess, withErrorHandling } from "@/lib/api/response";

const schema = z.object({
  /// Amount that represents the card fee (default 2000 RWF)
  cardFeeAmount: z.number().int().positive().default(2000),
  /// Only process payments from the last N days (default 30)
  daysBack: z.number().int().positive().max(365).default(30),
});

/**
 * POST /api/admin/members/card-payments/from-statement-import
 *
 * Finds payments from statement imports (provider = "STATEMENT_IMPORT")
 * that match the card fee amount and have been matched to a member,
 * then marks those members as having paid for their cards.
 *
 * This is useful after uploading a MoMo statement where members paid
 * the 2000 RWF card fee via mobile money.
 */
export const POST = withErrorHandling(
  async (request: NextRequest) => {
    const context = await requireApiPermission(PERMISSIONS.MEMBERS_UPDATE);
    const associationId = resolveAssociationScope(context);

    if (!associationId) {
      return apiBadRequest("Select an association first");
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return apiBadRequest("Invalid request body");
    }

    const { cardFeeAmount, daysBack } = parsed.data;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Find statement import payments of exactly the card fee amount
    // that have been matched to a member
    const payments = await prisma.payment.findMany({
      where: {
        associationId,
        provider: "STATEMENT_IMPORT",
        amount: cardFeeAmount,
        matchedMemberId: { not: null },
        createdAt: { gte: cutoffDate },
        // Only process payments that have been fully processed (credited)
        status: "VERIFIED",
      },
      select: {
        id: true,
        externalTransactionId: true,
        matchedMemberId: true,
        transactionDate: true,
        narration: true,
      },
    });

    if (payments.length === 0) {
      return apiSuccess({
        processed: 0,
        members: [],
        message: `No statement import payments of ${cardFeeAmount} RWF found in the last ${daysBack} days`,
      });
    }

    // Get unique member IDs
    const memberIds = [...new Set(payments.map((p) => p.matchedMemberId!).filter(Boolean))];

    // Find members who don't already have cardPaidAt set
    const members = await prisma.member.findMany({
      where: {
        id: { in: memberIds },
        cardPaidAt: null,
      },
      select: {
        id: true,
        memberNumber: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    if (members.length === 0) {
      return apiSuccess({
        processed: 0,
        members: [],
        message: "All matched members already have card payment recorded",
      });
    }

    // Update members to mark card as paid
    const updatedMembers: string[] = [];
    const now = new Date();

    for (const member of members) {
      await prisma.member.update({
        where: { id: member.id },
        data: { cardPaidAt: now, cardPaidById: context.user.id },
      });

      await recordAudit(
        {
          action: AUDIT_ACTIONS.MEMBER_CARD_PAYMENT_RECORDED,
          entityType: "Member",
          entityId: member.id,
          associationId,
          oldValue: { cardPaidAt: null },
          newValue: { cardPaidAt: now },
          metadata: {
            memberNumber: member.memberNumber,
            source: "statement_import_auto",
            cardFeeAmount,
            paymentCount: payments.filter((p) => p.matchedMemberId === member.id).length,
          },
        },
        context
      );

      updatedMembers.push(member.memberNumber);
    }

    return apiSuccess({
      processed: updatedMembers.length,
      members: updatedMembers,
      message: `Marked ${updatedMembers.length} member(s) as card paid from statement import`,
    });
  }
);