import type { Metadata } from "next";

/**
 * RTA's site, at /rta like every association's — but its own hand-built
 * website (./(site)) and sign-in (./login) rather than the generated ones in
 * app/[association]. A static segment, so it wins over [association] for /rta.
 *
 * This is the metadata the root layout carried while RTA's site was the root,
 * moved here unchanged. Restated whole, because Next replaces these entries
 * rather than merging them with the platform's.
 */
export const metadata: Metadata = {
  // Absolute, or the root's "| SSPSG" template would be appended to it.
  title: {
    absolute: "Rwanda Tailors Association | Empowering Tailors, Building Rwanda",
    template: "%s | RTA",
  },
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
  appleWebApp: {
    capable: true,
    title: "STGT",
    statusBarStyle: "black-translucent",
  },
};

export default function RtaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
