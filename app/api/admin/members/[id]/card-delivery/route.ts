import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiPermission, assertSameAssociation } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { apiBadRequest, apiNotFound, apiSuccess, withErrorHandling } from "@/lib/api/response";

const schema = z.object({ delivered: z.boolean() });

/**
 * PUT /api/admin/members/[id]/card-delivery   { delivered: boolean }
 *
 * Records whether a member has received their printed membership card, or
 * takes that back. Needs `members.update`: it is a change to the member's file.
 *
 * Every change is audited with the officer's name, since "who said this one
 * was delivered" is the question that comes up when it turns out not to have been.
 */
export const PUT = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const context = await requireApiPermission(PERMISSIONS.MEMBERS_UPDATE);
    const { id } = await params;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiBadRequest("Say whether the card is delivered");

    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, associationId: true, memberNumber: true, cardDeliveredAt: true },
    });
    if (!member) return apiNotFound("Member not found");

    assertSameAssociation(context, member, "Member");

    const { delivered } = parsed.data;

    // Already in the requested state: nothing to change or record. Keeps the
    // original date when someone clicks "delivered" twice.
    if (delivered === (member.cardDeliveredAt !== null)) {
      return apiSuccess({ delivered, cardDeliveredAt: member.cardDeliveredAt });
    }

    const updated = await prisma.member.update({
      where: { id },
      data: delivered
        ? { cardDeliveredAt: new Date(), cardDeliveredById: context.user.id }
        : { cardDeliveredAt: null, cardDeliveredById: null },
      select: { cardDeliveredAt: true },
    });

    await recordAudit(
      {
        action: delivered
          ? AUDIT_ACTIONS.MEMBER_CARD_DELIVERY_RECORDED
          : AUDIT_ACTIONS.MEMBER_CARD_DELIVERY_CLEARED,
        entityType: "Member",
        entityId: member.id,
        associationId: member.associationId,
        oldValue: { cardDeliveredAt: member.cardDeliveredAt },
        newValue: { cardDeliveredAt: updated.cardDeliveredAt },
        metadata: { memberNumber: member.memberNumber },
      },
      context
    );

    return apiSuccess({ delivered, cardDeliveredAt: updated.cardDeliveredAt });
  }
);