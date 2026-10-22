"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/LanguageProvider";

/**
 * Re-sends a single failed email delivery from the notifications admin
 * screens. The button only appears for deliveries that are eligible
 * (channel EMAIL, status FAILED), so it never surprises the officer with a
 * 400.
 */
export function ResendEmailButton({
  notificationId,
  deliveryId,
}: {
  notificationId: string;
  deliveryId: string;
}) {
  const { d } = useLanguage();
  const copy = d.admin.notifications;
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setError(null);
    setBusy(true);

    try {
      const response = await fetch(`/api/admin/notifications/${notificationId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? d.common.serverUnreachable);
        return;
      }

      router.refresh();
    } catch {
      setError(d.common.serverUnreachable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <Alert variant="error">{error}</Alert>}
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={resend}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <>
            <Mail className="size-3.5" aria-hidden="true" />
            {copy.resendEmail}
          </>
        )}
      </Button>
    </>
  );
}
