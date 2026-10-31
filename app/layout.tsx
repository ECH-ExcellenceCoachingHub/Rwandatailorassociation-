import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { LanguageProvider } from "@/components/LanguageProvider";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { InstallBanner } from "@/components/pwa/InstallBanner";
import { EARLY_INSTALL_SCRIPT } from "@/lib/pwa/install";
import { appIconHref, appManifestHref } from "@/lib/pwa/apps";
import { PLATFORM_FULL_NAME, PLATFORM_NAME, PLATFORM_TITLE } from "@/lib/brand";
import "./globals.css";

/**
 * Root layout — the shell shared by every area of the platform.
 *
 * The marketing Navbar and Footer used to live here. They moved down into
 * app/(public)/layout.tsx when the dashboards were added, because a signed-in
 * member looking at their savings balance should not be shown a "Become a
 * Member" call to action. The public pages themselves are unchanged and still
 * render exactly as before.
 *
 * Fonts, tokens and the language provider stay at this level so branding and
 * locale are consistent everywhere, dashboards included.
 */

// Self-hosted (app/fonts, the Latin subsets Google serves) rather than
// next/font/google: that loader downloads from Google during every build, and
// an unexpected Google response fails the whole deploy ("An error occurred in
// `next/font`"). Same variable names, so nothing that uses them changes.
const poppins = localFont({
  variable: "--font-poppins",
  src: [
    { path: "./fonts/poppins-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/poppins-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-latin-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/poppins-latin-800.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
});

const manrope = localFont({
  variable: "--font-manrope",
  // One variable font covering every weight the app uses (400–700).
  src: "./fonts/manrope-latin-variable.woff2",
  weight: "400 700",
  display: "swap",
});

// The root is the platform's (lib/brand.ts): a page titled "Sign in" reads
// "Sign in | SSPSG". RTA (/rta), each /abc site and the dashboard set their
// own, restating the share entries whole because Next replaces rather than
// merges them.
const description =
  "A savings and loans platform for private-sector associations, each on its own site under its own rules.";

export const metadata: Metadata = {
  title: {
    default: PLATFORM_TITLE,
    template: `%s | ${PLATFORM_NAME}`,
  },
  description,
  metadataBase: new URL(process.env.APP_URL || "http://localhost:10000"),
  keywords: [PLATFORM_NAME, PLATFORM_FULL_NAME, "savings", "loans", "associations", "Rwanda"],
  openGraph: {
    title: PLATFORM_TITLE,
    description,
    locale: "rw_RW",
    alternateLocale: "en_RW",
    type: "website",
  },
  // Installed-app behaviour on iPhone, which ignores most of the manifest.
  appleWebApp: {
    capable: true,
    title: PLATFORM_NAME,
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: appIconHref(null, "apple-touch-icon.png"),
  },
  // The SSPSG app. RTA's site and each /abc site link their own instead, so
  // installing from there puts that association's app on the phone.
  manifest: appManifestHref(null),
};

export const viewport: Viewport = {
  themeColor: "#0b1b33",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `lang` carries the default language, not necessarily this reader's: the
  // provider rewrites document.documentElement.lang as soon as it knows the
  // stored choice. It has to be a static value here because the root layout is
  // shared with the marketing pages, which are prerendered and must not be
  // made dynamic by reading a cookie.
  return (
    <html
      lang={DEFAULT_LOCALE}
      className={`${poppins.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-ink">
        {/* Before any React code: registers the service worker and catches
            Chrome's one-off install prompt. See lib/pwa/install.ts. */}
        <script dangerouslySetInnerHTML={{ __html: EARLY_INSTALL_SCRIPT }} />
        <LanguageProvider>
          {children}
          <InstallBanner />
        </LanguageProvider>
      </body>
    </html>
  );
}
