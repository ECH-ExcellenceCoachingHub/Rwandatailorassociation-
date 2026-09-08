import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getBkTransactionStats } from "@/lib/services/bk-transactions";
import { apiSuccess, withErrorHandling } from "@/lib/api/response";

const querySchema = z.object({
  associationId: z.string().optional(),
});

export const GET = withErrorHandling(
  async (request: NextRequest) => {
    await requireApiPermission(PERMISSIONS.BK_VIEW);
    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));

    const associationId = query.associationId ?? null;

    const stats = await getBkTransactionStats(associationId);

    return apiSuccess(stats);
  }
);
