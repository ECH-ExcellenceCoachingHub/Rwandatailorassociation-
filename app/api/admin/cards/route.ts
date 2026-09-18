import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  getMembershipCardDataForUsers,
  renderCardFronts,
  renderCardBacks,
} from "@/lib/cards/membership-card";
import { CARD_BATCH_SIZE, getCardBatch, parseCardFilters } from "@/lib/cards/register";
import { apiNotFound, withErrorHandling } from "@/lib/api/response";

/**
 * GET /api/admin/cards?side=front|back&batch=N[&q=…&status=…&photo=…]
 *
 * One batch of the card register as a single print-ready PDF — one card per
 * page, in the order the register shows them. The filters are the register's
 * own, read by the same parser, so a batch here is exactly a page there.
 *
 * FRONTS AND BACKS ARE SEPARATE FILES for the reason the single-card routes
 * give: a card printer runs the fronts, the stack goes back in, and it runs
 * the backs. The backs file has one page per card in the batch, so the second
 * pass lines up with the first without anyone setting a copy count.
 *
 * AUDITED PER MEMBER, not once per file. Every front carries that member's
 * working sign-in code, and the question the log has to answer later is "who
 * took a copy of this person's card" — which a single "printed 24 cards" entry
 * cannot answer when someone looks up one member. Backs carry nothing personal
 * and are not audited, matching the single-card route.
 */

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiPermission(PERMISSIONS.MEMBERS_VIEW);
  // An administrator only ever sees their own association's members; a super
  // administrator sees the register platform-wide.
  const associationId = resolveAssociationScope(context);

  const params = request.nextUrl.searchParams;
  const side = params.get("side") === "back" ? "back" : "front";
  const batch = Math.max(1, Math.floor(Number(params.get("batch"))) || 1);
  const filters = parseCardFilters(Object.fromEntries(params));

  const members = await getCardBatch({ associationId, filters, batch });
  if (members.length === 0) return apiNotFound("No cards in this batch");

  const first = (batch - 1) * CARD_BATCH_SIZE + 1;
  const last = first + members.length - 1;

  const headers = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="rta-cards-${side}-${first}-${last}.pdf"`,
    "Cache-Control": "no-store, private",
  };

  if (side === "back") {
    return new Response(new Uint8Array(await renderCardBacks(members.length)), { headers });
  }

  const cards = await getMembershipCardDataForUsers(
    members.map((m) => m.userId),
    context.user
  );

  // A few at a time: each is its own insert, and a whole batch at once would
  // take most of the connection pool from everyone else.
  for (let i = 0; i < members.length; i += 6) {
    await Promise.all(
      members.slice(i, i + 6).map((member) =>
        recordAudit(
          {
            action: AUDIT_ACTIONS.QR_ACCESS_ISSUED,
            entityType: "Member",
            entityId: member.id,
            associationId: member.associationId,
            metadata: {
              printedCardFor: member.memberNumber,
              side,
              bulk: { batch, cards: `${first}-${last}` },
            },
            severity: "WARNING",
          },
          context
        )
      )
    );
  }

  return new Response(new Uint8Array(await renderCardFronts(cards)), { headers });
});
