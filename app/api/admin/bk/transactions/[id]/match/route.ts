import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiPermission } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { manuallyMatchBkTransaction } from "@/lib/services/bk-transactions";
import { apiBadRequest, apiSuccess, withErrorHandling } from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

const schema = z.object({
  memberId: z.string().min(1, "Select a member"),
  reason: z
    .string()
    .trim()
    .min(10, "Give a reason of at least 10 characters — it is recorded in the audit log"),
});

export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const context = await requireApiPermission(PERMISSIONS.BK_MATCH_MANUAL);
    const { id } = await params;

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `bk-match:${context.user.id}:${ip}`,
      RATE_LIMITS.FINANCIAL_WRITE
    );
    if (!limit.allowed) {
      return apiBadRequest("Too many requests. Please slow down.");
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      return apiBadRequest("Please correct the highlighted fields", details);
    }

    const bkTx = await prisma.bkTransaction.findUnique({
      where: { id },
      select: { id: true, associationId: true },
    });

    if (!bkTx) {
      return apiBadRequest("Transaction not found");
    }

    const result = await manuallyMatchBkTransaction({
      bkTransactionId: id,
      memberId: parsed.data.memberId,
      adminUserId: context.user.id,
      reason: parsed.data.reason,
    });

    if (!result.ok) {
      return apiBadRequest(result.message);
    }

    return apiSuccess({ message: "Transaction matched to member" });
  }
);
