import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiPermission, assertSameAssociation } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { apiBadRequest, apiNotFound, apiSuccess, withErrorHandling } from "@/lib/api/response";

const schema = z.object({ paid: z.boolean() });

/**
 * PUT /api/admin/members/[id]/card-payment   { paid: boolean }
 *
 * Records whether a member has paid for their printed membership card, or
 * takes that back. Needs `members.update`: it is a change to the member's file.
 *
 * Not a ledger entry. The card fee is collected at the counter and this only
 * tracks who has settled it, so the office knows whose card to hand over.
 * Every change is audited with the officer's name, since "who said this one
 * was paid" is the question that comes up when it turns out not to have been.
 */
export const PUT = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const context = await requireApiPermission(PERMISSIONS.MEMBERS_UPDATE);
    const { id } = await params;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiBadRequest("Say whether the card is paid");

    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, associationId: true, memberNumber: true, cardPaidAt: true },
    });
    if (!member) return apiNotFound("Member not found");

    assertSameAssociation(context, member, "Member");

    const { paid } = parsed.data;

    // Already in the requested state: nothing to change or record. Keeps the
    // original date when someone clicks "paid" twice.
    if (paid === (member.cardPaidAt !== null)) {
      return apiSuccess({ paid, cardPaidAt: member.cardPaidAt });
    }

    const updated = await prisma.member.update({
      where: { id },
      data: paid
        ? { cardPaidAt: new Date(), cardPaidById: context.user.id }
        : { cardPaidAt: null, cardPaidById: null },
      select: { cardPaidAt: true },
    });

    await recordAudit(
      {
        action: paid
          ? AUDIT_ACTIONS.MEMBER_CARD_PAYMENT_RECORDED
          : AUDIT_ACTIONS.MEMBER_CARD_PAYMENT_CLEARED,
        entityType: "Member",
        entityId: member.id,
        associationId: member.associationId,
        oldValue: { cardPaidAt: member.cardPaidAt },
        newValue: { cardPaidAt: updated.cardPaidAt },
        metadata: { memberNumber: member.memberNumber },
      },
      context
    );

    return apiSuccess({ paid, cardPaidAt: updated.cardPaidAt });
  }
);
