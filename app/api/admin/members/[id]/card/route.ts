import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiPermission, assertSameAssociation } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  getMembershipCardData,
  renderCardFront,
  renderCardBack,
} from "@/lib/cards/membership-card";
import { apiNotFound, withErrorHandling } from "@/lib/api/response";

/**
 * GET /api/admin/members/[id]/card?side=front|back
 *
 * A member's card, printed by the office on their behalf. Most members here do
 * not own a printer, and plenty do not own a phone that can hold a PDF — the
 * association prints their card and hands it over, so the ability cannot live
 * only on the member's own login.
 *
 * WHY THIS IS AUDITED WHEN THE MEMBER'S OWN ROUTE IS NOT. The front embeds a
 * working sign-in credential. A member downloading their own is unremarkable;
 * a member of staff downloading someone else's is the same act as taking a
 * copy of their key, and the log is what makes that answerable afterwards.
 */

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const context = await requireApiPermission(PERMISSIONS.MEMBERS_VIEW);

    const member = await prisma.member.findUnique({
      where: { id },
      select: {
        id: true,
        memberNumber: true,
        associationId: true,
        user: { select: { id: true } },
      },
    });

    if (!member) return apiNotFound("No such member");

    // An administrator of one association must not be able to print a card —
    // and with it a sign-in code — for a member of another.
    assertSameAssociation(context, member, "Member");

    const side = request.nextUrl.searchParams.get("side") === "back" ? "back" : "front";

    const headers = {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rta-card-${side}-${member.memberNumber}.pdf"`,
      "Cache-Control": "no-store, private",
    };

    if (side === "back") {
      return new Response(new Uint8Array(await renderCardBack()), { headers });
    }

    // Passing the officer means a code issued for this print is logged as
    // theirs, not as something the member did.
    const data = await getMembershipCardData(member.user.id, context.user);

    await recordAudit(
      {
        action: AUDIT_ACTIONS.QR_ACCESS_ISSUED,
        entityType: "Member",
        entityId: member.id,
        associationId: member.associationId,
        metadata: { printedCardFor: member.memberNumber, side },
        severity: "WARNING",
      },
      context
    );

    return new Response(new Uint8Array(await renderCardFront(data)), { headers });
  }
);
