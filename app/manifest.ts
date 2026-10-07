import type { MetadataRoute } from "next";

/**
 * Web app manifest, served at /manifest.webmanifest and linked from every page
 * by Next. It is what makes the site installable as the STGT app.
 *
 * `start_url` is the sign-in page: the installed app is for members, not the
 * marketing site. A member who is already signed in is bounced from /login to
 * their own landing page by the middleware, so they never see the form twice.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "STGT — Rwanda Tailors Association",
    short_name: "STGT",
    description: "Savings and loans for members of the Rwanda Tailors Association.",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1b33",
    theme_color: "#0b1b33",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
