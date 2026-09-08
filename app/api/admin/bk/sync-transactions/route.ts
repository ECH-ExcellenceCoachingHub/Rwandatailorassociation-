import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { syncBkTransactions } from "@/lib/services/bk-transactions";
import { apiBadRequest, apiSuccess, withErrorHandling } from "@/lib/api/response";
import { RATE_LIMITS, checkRateLimit, getClientIp } from "@/lib/api/rate-limit";

const schema = z.object({
  associationId: z.string().optional(),
  lookbackHours: z.number().int().positive().max(720).optional(),
  pageSize: z.number().int().positive().max(100).optional(),
  maxPages: z.number().int().positive().max(100).optional(),
});

export const POST = withErrorHandling(
  async (request: NextRequest) => {
    const context = await requireApiPermission(PERMISSIONS.BK_SYNC);

    const ip = await getClientIp();
    const limit = checkRateLimit(
      `bk-sync:${context.user.id}:${ip}`,
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
      return apiBadRequest("Invalid parameters", details);
    }

    const result = await syncBkTransactions({
      ...parsed.data,
      triggeredById: context.user.id,
    });

    return apiSuccess({
      message: "BK transaction sync completed",
      ...result,
    });
  }
);
