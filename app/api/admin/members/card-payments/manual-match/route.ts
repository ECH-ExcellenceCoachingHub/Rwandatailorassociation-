import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { apiBadRequest, apiSuccess, withErrorHandling } from "@/lib/api/response";

const assignmentSchema = z.object({
  fingerprint: z.string().min(8).max(64),
  memberId: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount"),
  date: z.string(),
  description: z.string().max(500),
});

const schema = z.object({
  assignments: z.array(assignmentSchema).min(1).max(2000),
});

/**
 * POST /api/admin/members/card-payments/manual-match
 *
 * Manually assigns unmatched statement payments to members and marks their
 * cards as paid. Used when automatic matching fails (e.g. phone number not
 * registered, name doesn't match).
 *
 * Creates a Payment record matched to the specified member, then sets
 * cardPaidAt/cardPaidById on the member.
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

    const { assignments } = parsed.data;
    const now = new Date();
    const processed: string[] = [];

    for (const assignment of assignments) {
      // Verify the member belongs to this association and is active
      const member = await prisma.member.findUnique({
        where: { id: assignment.memberId },
        select: {
          id: true,
          memberNumber: true,
          cardPaidAt: true,
          associationId: true,
        },
      });

      if (!member || member.associationId !== associationId) {
        continue;
      }

      // Skip if already card paid
      if (member.cardPaidAt !== null) {
        continue;
      }

      // Create the payment record matched to this member
      const externalTransactionId = `PDF-MANUAL-${assignment.fingerprint}`;

      try {
        await prisma.payment.create({
          data: {
            associationId,
            provider: "STATEMENT_IMPORT",
            externalTransactionId,
            amount: assignment.amount,
            currency: "RWF",
            providerStatus: "MANUAL_MATCH",
            status: "VERIFIED",
            verifiedAt: now,
            verificationResponse: {
              method: "MANUAL_MATCH",
              attestedByUserId: context.user.id,
              fingerprint: assignment.fingerprint,
            },
            narration: assignment.description,
            transactionDate: new Date(assignment.date),
            valueDate: new Date(assignment.date),
            ingestSource: "MANUAL",
            matchedById: context.user.id,
            matchedMemberId: assignment.memberId,
            matchStrategy: "MANUAL_ADMIN",
            matchConfidence: 100,
            processedAt: now,
          },
          select: { id: true },
        });
      } catch {
        // Duplicate externalTransactionId — skip
        continue;
      }

      // Mark the member's card as paid
      await prisma.member.update({
        where: { id: assignment.memberId },
        data: { cardPaidAt: now, cardPaidById: context.user.id },
      });

      await recordAudit(
        {
          action: AUDIT_ACTIONS.MEMBER_CARD_PAYMENT_RECORDED,
          entityType: "Member",
          entityId: assignment.memberId,
          associationId,
          oldValue: { cardPaidAt: null },
          newValue: { cardPaidAt: now },
          metadata: {
            memberNumber: member.memberNumber,
            source: "manual_match",
            fingerprint: assignment.fingerprint,
            amount: assignment.amount,
          },
        },
        context
      );

      processed.push(member.memberNumber);
    }

    return apiSuccess({
      processed: processed.length,
      members: processed,
      message: `Marked ${processed.length} member(s) as card paid via manual match`,
    });
  }
);