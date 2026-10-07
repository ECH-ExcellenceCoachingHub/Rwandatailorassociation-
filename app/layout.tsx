import type { Metadata, Viewport } from "next";
import { Poppins, Manrope } from "next/font/google";
import { LanguageProvider } from "@/components/LanguageProvider";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { InstallBanner } from "@/components/pwa/InstallBanner";
import { EARLY_INSTALL_SCRIPT } from "@/lib/pwa/install";
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

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rwanda Tailors Association | Empowering Tailors, Building Rwanda",
  description:
    "The official association representing tailors across Rwanda. Together we promote quality, innovation, business growth and a stronger tailoring industry.",
  keywords: [
    "Rwanda Tailors Association",
    "RTA",
    "Rwanda fashion industry",
    "tailoring Rwanda",
    "Made in Rwanda",
  ],
  openGraph: {
    title: "Rwanda Tailors Association",
    description:
      "Empowering Tailors. Building Rwanda. The official association representing tailors across Rwanda.",
    locale: "rw_RW",
    alternateLocale: "en_RW",
    type: "website",
  },
  // Installed-app behaviour on iPhone, which ignores most of the manifest.
  appleWebApp: {
    capable: true,
    title: "STGT",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
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
