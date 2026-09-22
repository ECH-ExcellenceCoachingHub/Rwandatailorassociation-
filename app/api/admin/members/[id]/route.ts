import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiPermission, assertSameAssociation } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  applyMemberAction,
  deleteMember,
  updateMember,
} from "@/lib/services/members";
import {
  MEMBER_ACTION_PERMISSION,
  MEMBER_ACTION_REASON_MIN,
  updateMemberSchema,
  type MemberAction,
} from "@/lib/validation/members";
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  apiTooManyRequests,
  withErrorHandling,
} from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

function reasonFor(action: MemberAction) {
  const min = MEMBER_ACTION_REASON_MIN[action] ?? 1;
  return z
    .string()
    .trim()
    .min(min, `Give a reason of at least ${min} characters — it is recorded in the audit log`);
}

/**
 * Every decision except deletion, which is DELETE below. The permission each
 * needs and the length of reason it takes are shared with the register's bulk
 * actions in lib/validation/members.ts.
 */
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("reject"), reason: reasonFor("reject") }),
  z.object({ action: z.literal("suspend"), reason: reasonFor("suspend") }),
  z.object({ action: z.literal("reactivate"), reason: z.string().trim().optional() }),
  z.object({ action: z.literal("close"), reason: reasonFor("close") }),
  z.object({ action: z.literal("verify_kyc") }),
  z.object({ action: z.literal("reject_kyc"), reason: reasonFor("reject_kyc") }),
]);

/**
 * PATCH /api/admin/members/[id]
 *
 * Membership decisions. Each action maps to its own permission, so an
 * administrator who may approve applications does not automatically gain the
 * ability to suspend an existing member, and one who may suspend cannot
 * thereby close a membership for good.
 */
export const PATCH = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      return apiBadRequest("Please correct the highlighted fields", details);
    }

    const context = await requireApiPermission(MEMBER_ACTION_PERMISSION[parsed.data.action]);

    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, associationId: true },
    });

    if (!member) return apiNotFound("Member not found");

    // Cross-tenant guard: an admin must not act on another association's member.
    assertSameAssociation(context, member, "Member");

    const data = parsed.data;
    const result = await applyMemberAction({
      action: data.action,
      memberId: id,
      actorId: context.user.id,
      reason: "reason" in data ? data.reason : undefined,
      note: "note" in data ? data.note : undefined,
    });

    if (!result.ok) return apiBadRequest(result.message);

    return apiSuccess({ message: "Done" });
  }
);

const deleteSchema = z.object({ reason: reasonFor("delete") });

/**
 * DELETE /api/admin/members/[id]
 *
 * Permanently erases a member, their login and everything recorded against
 * them — a test account, a record made in error. Requires `members.delete` and
 * a written reason. Their history does not stop it; see `deleteMember` for
 * what goes and what is put right so the rest of the books stay consistent.
 *
 * A real member who is leaving is closed with PATCH { action: "close" }
 * instead, which keeps the ledger intact. The whole file is copied into the
 * audit log before anything is removed.
 */
export const DELETE = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const context = await requireApiPermission(PERMISSIONS.MEMBERS_DELETE);
    const { id } = await params;

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `member-delete:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) {
      return apiTooManyRequests("Too many requests. Please slow down.", limit.retryAfter);
    }

    const body = await request.json().catch(() => null);
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      // One field, so its own message rather than "correct the highlighted
      // fields", which would leave the administrator guessing.
      return apiBadRequest(
        parsed.error.issues[0]?.message ?? "The request was not valid",
        { reason: parsed.error.issues.map((issue) => issue.message) }
      );
    }

    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, associationId: true },
    });

    if (!member) return apiNotFound("Member not found");

    // Cross-tenant guard: an admin must not erase another association's member.
    assertSameAssociation(context, member, "Member");

    const result = await deleteMember({
      memberId: id,
      actorId: context.user.id,
      reason: parsed.data.reason,
    });

    if (!result.ok) return apiBadRequest(result.message);

    return apiSuccess({ deleted: true });
  }
);

/**
 * PUT /api/admin/members/[id]
 *
 * Edits a member's file — their details, not their membership.
 *
 * Separate from PATCH above on purpose: that endpoint moves a member between
 * states and each of its actions demands its own permission and a reason.
 * This one rewrites fields, needs `members.update`, and records a before/after
 * diff of exactly what changed.
 */
export const PUT = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const context = await requireApiPermission(PERMISSIONS.MEMBERS_UPDATE);
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = updateMemberSchema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      return apiBadRequest("Please correct the highlighted fields", details);
    }

    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, associationId: true },
    });

    if (!member) return apiNotFound("Member not found");

    // Cross-tenant guard: an admin must not edit another association's member.
    assertSameAssociation(context, member, "Member");

    const result = await updateMember({
      memberId: id,
      input: parsed.data,
      actorId: context.user.id,
    });

    if (!result.ok) {
      return apiBadRequest(result.message, { [result.field]: [result.message] });
    }

    return apiSuccess({ message: "Member details updated" });
  }
);
