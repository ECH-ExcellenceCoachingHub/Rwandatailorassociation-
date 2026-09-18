import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiPermission, assertSameAssociation } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { addMemberNote } from "@/lib/services/members";
import {
  apiBadRequest,
  apiCreated,
  apiNotFound,
  withErrorHandling,
} from "@/lib/api/response";

const schema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write the note before saving it")
    .max(2000, "Keep a note under 2,000 characters"),
});

/**
 * POST /api/admin/members/[id]/notes
 *
 * Adds an internal note to a member's file. Needs `members.update`: writing on
 * somebody's file is editing it.
 */
export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const context = await requireApiPermission(PERMISSIONS.MEMBERS_UPDATE);
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return apiBadRequest(
        parsed.error.issues[0]?.message ?? "The request was not valid",
        { body: parsed.error.issues.map((issue) => issue.message) }
      );
    }

    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, associationId: true },
    });

    if (!member) return apiNotFound("Member not found");

    // Cross-tenant guard: an admin must not write on another association's file.
    assertSameAssociation(context, member, "Member");

    await addMemberNote({
      memberId: id,
      actorId: context.user.id,
      body: parsed.data.body,
    });

    return apiCreated({ saved: true });
  }
);
