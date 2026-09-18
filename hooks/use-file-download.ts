"use client";

import { useCallback, useState } from "react";

/**
 * Fetches a generated file and hands it to the browser as a download.
 *
 * FETCHED AND HANDED OVER AS A BLOB rather than linked with `<a download>`.
 * Cards are generated on demand — a front may have to issue a QR code first —
 * so a plain link would leave the reader looking at an unresponsive page for a
 * second or two with nothing to say the press had registered. Fetching lets
 * the button show that it is working, and lets a failure be a message on the
 * page rather than a browser error screen.
 */
export function useFileDownload() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const download = useCallback(async (url: string, fallbackName: string) => {
    setBusy(true);
    setFailed(false);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);

      const blob = await response.blob();

      // The filename the route chose, so a print shop receiving thirty of
      // these can still tell whose is whose.
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const named = /filename="([^"]+)"/.exec(disposition)?.[1];

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = named ?? fallbackName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Freed on the next tick: revoking synchronously can beat the download
      // in some browsers and produce an empty file.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, failed, download };
}
