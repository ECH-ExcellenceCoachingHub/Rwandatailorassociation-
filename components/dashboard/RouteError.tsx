"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";
import { useLanguage } from "@/components/LanguageProvider";

/**
 * What a page shows when rendering it threw.
 *
 * In practice that is almost always the database connection dropping — the
 * pool already retries a failed connect, so reaching here means the network
 * stayed down for a couple of seconds. The page says so and offers a retry,
 * instead of the framework's error screen, which reads as "the system is
 * broken" to someone who only needed to press the button again.
 *
 * `router.refresh()` as well as `reset()`: the failure happened in a server
 * component, and `reset()` on its own only re-renders on the client, from the
 * same failed payload.
 */
export function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const { d } = useLanguage();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      icon={WifiOff}
      title={d.shell.errorTitle}
      description={d.shell.errorBody}
      className="mx-auto my-10 max-w-xl"
      action={
        <Button
          size="sm"
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        >
          <RotateCw className="size-3.5" aria-hidden="true" />
          {d.shell.errorRetry}
        </Button>
      }
    />
  );
}
