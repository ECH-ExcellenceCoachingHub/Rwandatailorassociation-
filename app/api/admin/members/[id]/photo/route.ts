import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiPermission, assertSameAssociation } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiNotFound, withErrorHandling } from "@/lib/api/response";

/**
 * GET /api/admin/members/[id]/photo?of=member|successor
 *
 * The faces on a member's file, for the staff who have to match them to a
 * person standing in front of them. The member's own photograph is the one
 * that prints on their card; the successor's is checked at the warehouse
 * counter when somebody collects on the member's behalf, which is the entire
 * reason it is on file.
 *
 * ONE ROUTE FOR BOTH because the guard is the only interesting part of it, and
 * a second copy of a permission check is a second place for it to be got
 * wrong.
 *
 * NOT AUDITED, unlike the card route next door. A card embeds a working
 * sign-in credential, so downloading one is the same act as taking a copy of
 * somebody's key. A photograph is not a credential: looking at one is the
 * ordinary work of the counter, and a log entry per glance would bury the
 * entries that matter.
 */

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const context = await requireApiPermission(PERMISSIONS.MEMBERS_VIEW);

    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, associationId: true, userId: true },
    });

    if (!member) return apiNotFound("No such member");

    // An administrator of one association must not be able to pull a face out
    // of another's member files.
    assertSameAssociation(context, member, "Member");

    const successor = request.nextUrl.searchParams.get("of") === "successor";

    const photo = successor
      ? await prisma.memberSuccessorPhoto.findUnique({
          where: { memberId: member.id },
          select: { data: true, mimeType: true, updatedAt: true },
        })
      : await prisma.userAvatar.findUnique({
          where: { userId: member.userId },
          select: { data: true, mimeType: true, updatedAt: true },
        });

    if (!photo) return apiNotFound("No photograph on file");

    return new Response(new Uint8Array(photo.data), {
      headers: {
        "Content-Type": photo.mimeType,
        // Somebody else's face, on a staff session. Private, but re-fetching
        // it on every render of the member file is wasteful.
        "Cache-Control": "private, max-age=60",
        ETag: `"${photo.updatedAt.getTime()}"`,
      },
    });
  }
);
