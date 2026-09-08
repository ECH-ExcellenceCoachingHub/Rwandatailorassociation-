import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getBkSyncLogs } from "@/lib/services/bk-transactions";
import { apiSuccess, withErrorHandling } from "@/lib/api/response";

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const GET = withErrorHandling(
  async (request: NextRequest) => {
    await requireApiPermission(PERMISSIONS.BK_VIEW);
    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));

    const logs = await getBkSyncLogs(query.limit);

    return apiSuccess({ logs });
  }
);
