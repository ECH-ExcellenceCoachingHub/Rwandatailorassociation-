"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js once the page has loaded. Without a service worker the
 * browser will not offer to install the app. Skipped in development, where a
 * worker would sit between the dev server and hot reload.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Not installable, but the site itself works fine without it.
    });
  }, []);

  return null;
}
