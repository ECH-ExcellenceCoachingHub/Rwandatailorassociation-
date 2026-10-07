/**
 * Service worker for the installed STGT app.
 *
 * Deliberately minimal. Its job is to make the site installable and to show a
 * friendly page instead of the browser's dinosaur when a member opens the app
 * with no signal. It never caches pages or API responses: everything behind
 * sign-in is someone's money, and a stale or shared cached copy of a balance
 * would be worse than no page at all.
 */

const OFFLINE_HTML = `<!doctype html>
<html lang="rw"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>STGT</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#0b1b33;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px}
  h1{font-size:22px;margin:0 0 8px} p{color:#8db4e3;margin:0 0 20px;line-height:1.5}
  button{background:#1f4a88;color:#fff;border:0;border-radius:12px;padding:12px 22px;font-size:16px}
</style></head>
<body><div>
  <h1>Nta murandasi / You are offline</h1>
  <p>Reba ko ufite interineti maze wongere ugerageze.<br>Check your connection and try again.</p>
  <button onclick="location.reload()">Ongera ugerageze / Retry</button>
</div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(OFFLINE_HTML, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
    )
  );
});
