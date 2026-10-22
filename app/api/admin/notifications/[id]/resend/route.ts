import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiPermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { resendFailedEmailDelivery } from "@/lib/notifications";
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  withErrorHandling,
} from "@/lib/api/response";

/**
 * POST /api/admin/notifications/[id]/resend
 *
 * Re-sends a single failed email delivery belonging to the caller's
 * association. The delivery is reset to PENDING and sent through the normal
 * dispatch path, so provider, backoff and recording behaviour is unchanged.
 *
 * Body: { deliveryId }
 */
const schema = z.object({
  deliveryId: z.string().min(1, "Select a delivery to resend"),
});

export const POST = withErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const context = await requireApiPermission(PERMISSIONS.NOTIFICATIONS_SEND);
    const associationId = resolveAssociationScope(context);

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (details[issue.path.join(".") || "_"] ??= []).push(issue.message);
      }
      return apiBadRequest("Invalid request", details);
    }

    const resent = await resendFailedEmailDelivery({
      notificationId: id,
      deliveryId: parsed.data.deliveryId,
      associationId,
    });

    if (!resent) {
      return apiNotFound(
        "No resendable failed email delivery with that id (it may already have been retried)"
      );
    }

    return apiSuccess({ ok: true, deliveryId: resent.deliveryId });
  }
);
