import { type NextRequest } from "next/server";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { apiBadRequest, apiSuccess, withErrorHandling } from "@/lib/api/response";

/**
 * GET /api/admin/members/list?active=true
 *
 * Returns active members for the caller's association, used for manual
 * member selection in card payment matching.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const context = await requireApiPermission(PERMISSIONS.MEMBERS_VIEW);
  const associationId = resolveAssociationScope(context);

  if (!associationId) {
    return apiBadRequest("Select an association first");
  }

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "true";

  const members = await prisma.member.findMany({
    where: {
      associationId,
      ...(activeOnly ? { status: "ACTIVE" } : {}),
    },
    select: {
      id: true,
      memberNumber: true,
      mobileMoneyNumber: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
    },
    orderBy: [
      { user: { lastName: "asc" } },
      { user: { firstName: "asc" } },
    ],
  });

  return apiSuccess({
    members: members.map((m) => ({
      id: m.id,
      memberNumber: m.memberNumber,
      fullName: `${m.user.firstName} ${m.user.lastName}`.trim(),
      phone: m.mobileMoneyNumber || m.user.phone || null,
    })),
  });
});
