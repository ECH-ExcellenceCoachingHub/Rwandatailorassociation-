"use client";

import { useState } from "react";

import { CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/LanguageProvider";
import { useSiteRouter } from "@/hooks/use-site-paths";

export function MarkAllReadButton() {
  const router = useSiteRouter();
  const { d } = useLanguage();
  const [working, setWorking] = useState(false);

  async function markAll() {
    setWorking(true);
    await fetch("/api/notifications/read-all", { method: "POST" }).catch(
      () => undefined
    );
    router.refresh();
    setWorking(false);
  }

  return (
    <Button variant="outline" size="sm" onClick={markAll} disabled={working}>
      {working ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <CheckCheck className="size-4" aria-hidden="true" />
      )}
      {d.views.notifications.markAllRead}
    </Button>
  );
}
