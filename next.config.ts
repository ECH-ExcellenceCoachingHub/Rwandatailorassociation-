import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: `output: "export"` was removed deliberately. The platform now needs a
  // server runtime for route handlers, middleware-based RBAC, the payment
  // webhook/reconciliation endpoints and session cookies — none of which can
  // exist in a static export. The public marketing pages still render
  // identically; they are simply statically optimised by Next at build time
  // instead of being emitted as a standalone `out/` folder.
  output: "standalone",
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["@node-rs/argon2", "pino", "exceljs"],
  // RTA's website moved from the root to /rta when the platform took the root
  // over, and SSPSG's own pages moved from /sspsg to the root. Links people
  // saved or shared in either era still land somewhere real. Temporary (307)
  // so nothing gets cached forever while the layout is new. /register has a
  // page of its own (app/register) because it reads ?association=.
  async redirects() {
    return [
      { source: "/news", destination: "/rta/news", permanent: false },
      { source: "/news/:slug", destination: "/rta/news/:slug", permanent: false },
      { source: "/sspsg", destination: "/", permanent: false },
      { source: "/sspsg/login", destination: "/login", permanent: false },
    ];
  },
  // The service worker must never be served stale, or a fix to it would take
  // days to reach phones that already installed the app.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
