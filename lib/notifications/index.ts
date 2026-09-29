import "server-only";
import { prisma } from "@/lib/db/prisma";
import { notificationLogger, serialiseError } from "@/lib/logger";
import { getEmailProvider, getSmsProvider } from "@/lib/notifications/providers";
import { renderNotification, type TemplateContext } from "@/lib/notifications/templates";
import { NOTIFICATION_EVENTS, type NotificationEvent } from "@/lib/notifications/types";
import type { NotificationChannel } from "@/lib/generated/prisma/enums";

export * from "@/lib/notifications/types";
export { renderNotification } from "@/lib/notifications/templates";

/**
 * Notification dispatch.
 *
 * TWO PROPERTIES THAT MATTER MORE THAN THEY LOOK:
 *
 *  1. NOTIFYING NEVER FAILS THE ACTION. Every send is wrapped so a dead SMS
 *     gateway cannot roll back a disbursement or a repayment. The delivery is
 *     recorded as FAILED and retried later; the money movement stands.
 *
 *  2. THE IN-APP RECORD IS WRITTEN FIRST, AND ALWAYS. Email and SMS are
 *     best-effort external systems; the in-app notification is the durable
 *     one, so a member can always find out what happened by signing in even if
 *     every external channel was down.
 */

export interface NotifyParams {
  userId: string;
  event: NotificationEvent;
  context: Omit<TemplateContext, "firstName" | "associationName">;
  channels?: NotificationChannel[];
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_CHANNELS: NotificationChannel[] = ["IN_APP", "EMAIL", "SMS"];

/**
 * Sends a notification across the requested channels.
 * Resolves even when every external channel fails.
 */
export async function notify(params: NotifyParams): Promise<{ notificationId: string | null }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        id: true,
        firstName: true,
        email: true,
        phone: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        associationId: true,
        association: { select: { name: true } },
        member: { select: { paymentReference: true } },
      },
    });

    if (!user) {
      notificationLogger.warn({ userId: params.userId }, "notify: unknown user");
      return { notificationId: null };
    }

    const templateContext: TemplateContext = {
      firstName: user.firstName,
      associationName: user.association?.name ?? "RTA",
      paymentReference: user.member?.paymentReference,
      ...params.context,
    };

    const rendered = renderNotification(params.event, templateContext);

    const requested = params.channels ?? DEFAULT_CHANNELS;

    // Per-user, per-event opt-outs. Absent rows mean "use the default".
    const preferences = await prisma.notificationPreference.findMany({
      where: { userId: user.id, eventType: params.event },
      select: { channel: true, enabled: true },
    });
    const disabled = new Set(
      preferences.filter((p) => !p.enabled).map((p) => p.channel)
    );

    const channels = requested.filter((c) => !disabled.has(c));

    // The durable record, written before any external attempt.
    const notification = await prisma.notification.create({
      data: {
        associationId: user.associationId,
        userId: user.id,
        eventType: params.event,
        title: rendered.title,
        body: rendered.body,
        severity: rendered.severity,
        actionUrl: rendered.actionUrl ?? null,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        // The template context is persisted alongside the caller's metadata.
        // External deliveries are dispatched asynchronously and re-render from
        // this row, so without it an SMS arrives reading "received RWF 0. New
        // balance RWF 0. Ref undefined" — the message sends successfully and
        // says nothing. The in-app copy looked right because its body was
        // rendered at creation, which is what made this easy to miss.
        metadata: { ...params.metadata, ...templateContext } as object,
        deliveries: {
          create: channels
            .filter((c) => c !== "IN_APP")
            .map((channel) => ({
              channel,
              status: "PENDING" as const,
              destination: channel === "EMAIL" ? user.email : user.phone,
            })),
        },
      },
      include: { deliveries: true },
    });

    // Fire external channels without blocking the caller. A loan approval
    // should not wait on an SMS gateway handshake.
    void dispatchDeliveries(notification.id).catch((error) => {
      notificationLogger.error(
        { notificationId: notification.id, ...serialiseError(error) },
        "delivery dispatch failed"
      );
    });

    return { notificationId: notification.id };
  } catch (error) {
    // Deliberately swallowed. See the header: a notification failure must
    // never propagate into the financial operation that triggered it.
    notificationLogger.error(
      { userId: params.userId, event: params.event, ...serialiseError(error) },
      "notify failed"
    );
    return { notificationId: null };
  }
}

/** Attempts every pending delivery for a notification. */
export async function dispatchDeliveries(notificationId: string): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      deliveries: { where: { status: { in: ["PENDING", "QUEUED"] } } },
      user: {
        select: {
          firstName: true,
          email: true,
          phone: true,
          association: { select: { name: true } },
          member: { select: { paymentReference: true } },
        },
      },
    },
  });

  if (!notification) return;

  const rendered = renderNotification(notification.eventType as NotificationEvent, {
    firstName: notification.user.firstName,
    associationName: notification.user.association?.name ?? "RTA",
    paymentReference: notification.user.member?.paymentReference,
    ...((notification.metadata as TemplateContext | null) ?? {}),
  });

  for (const delivery of notification.deliveries) {
    await attemptDelivery(delivery.id, delivery.channel, {
      email: notification.user.email,
      phone: notification.user.phone,
      subject: rendered.emailSubject,
      text: rendered.emailText,
      sms: rendered.sms ?? rendered.body,
      hasSms: Boolean(rendered.sms),
    });
  }
}

async function attemptDelivery(
  deliveryId: string,
  channel: NotificationChannel,
  content: {
    email: string | null;
    phone: string | null;
    subject: string;
    text: string;
    sms: string;
    hasSms: boolean;
  }
): Promise<void> {
  const destination = channel === "EMAIL" ? content.email : content.phone;

  if (!destination) {
    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: "SKIPPED", errorMessage: `No ${channel.toLowerCase()} address on file` },
    });
    return;
  }

  // Some events deliberately have no SMS variant (security alerts). Skipping
  // is the correct outcome, not a failure.
  if (channel === "SMS" && !content.hasSms) {
    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: "SKIPPED", errorMessage: "No SMS template for this event" },
    });
    return;
  }

  const provider = channel === "EMAIL" ? getEmailProvider() : getSmsProvider();

  const result =
    channel === "EMAIL"
      ? await getEmailProvider().send({
          to: destination,
          subject: content.subject,
          text: content.text,
        })
      : await getSmsProvider().send({ to: destination, body: content.sms });

  const current = await prisma.notificationDelivery.findUnique({
    where: { id: deliveryId },
    select: { attempts: true },
  });

  const attempts = (current?.attempts ?? 0) + 1;

  await prisma.notificationDelivery.update({
    where: { id: deliveryId },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      destination,
      subject: channel === "EMAIL" ? content.subject : null,
      content: channel === "EMAIL" ? content.text : content.sms,
      provider: provider.name,
      providerMessageId: result.providerMessageId ?? null,
      errorMessage: result.error ?? null,
      attempts,
      sentAt: result.ok ? new Date() : null,
      // Exponential backoff, capped at five attempts. Retrying a permanently
      // invalid address forever just burns provider quota.
      nextRetryAt:
        !result.ok && result.retryable && attempts < 5
          ? new Date(Date.now() + 2 ** attempts * 60_000)
          : null,
    },
  });
}

/**
 * Retries deliveries that need another attempt. Called by the worker.
 *
 * Covers two cases:
 *
 *  • FAILED with an elapsed backoff — the ordinary retry.
 *
 *  • PENDING and stale. `notify` dispatches deliveries fire-and-forget so the
 *    caller is not blocked on an SMS gateway, which means a process restart
 *    between creating the row and sending it leaves the delivery stranded in
 *    PENDING forever. Anything still pending after ten minutes is assumed
 *    orphaned and picked back up — otherwise a member's payment confirmation
 *    is silently never sent.
 */
export async function retryFailedDeliveries(limit = 100): Promise<number> {
  const staleThreshold = new Date(Date.now() - 10 * 60_000);

  const due = await prisma.notificationDelivery.findMany({
    where: {
      OR: [
        { status: "FAILED", nextRetryAt: { lte: new Date() } },
        { status: { in: ["PENDING", "QUEUED"] }, createdAt: { lt: staleThreshold } },
      ],
    },
    select: { notificationId: true },
    distinct: ["notificationId"],
    take: limit,
  });

  let attempted = 0;

  for (const delivery of due) {
    // Reset FAILED rows to PENDING so dispatchDeliveries picks them up.
    // Stale PENDING rows are already in the right state.
    await prisma.notificationDelivery.updateMany({
      where: {
        notificationId: delivery.notificationId,
        status: "FAILED",
        nextRetryAt: { lte: new Date() },
      },
      data: { status: "PENDING" },
    });

    await dispatchDeliveries(delivery.notificationId).catch(() => undefined);
    attempted++;
  }

  return attempted;
}

/** Sends the same event to every admin of an association. */
export async function notifyAssociationAdmins(
  associationId: string,
  event: NotificationEvent,
  context: Omit<TemplateContext, "firstName" | "associationName">,
  options: { channels?: NotificationChannel[]; entityType?: string; entityId?: string } = {}
): Promise<number> {
  const admins = await prisma.user.findMany({
    where: { associationId, role: "ADMIN", status: "ACTIVE" },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) =>
      notify({
        userId: admin.id,
        event,
        context,
        // Admin operational alerts default to in-app only; an unmatched
        // payment does not warrant an SMS to every administrator.
        channels: options.channels ?? ["IN_APP"],
        entityType: options.entityType,
        entityId: options.entityId,
      })
    )
  );

  return admins.length;
}

export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<void> {
  // Scoped by userId so one member cannot mark another's notification read.
  await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export { NOTIFICATION_EVENTS };
