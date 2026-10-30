import type { Metadata } from "next";
import { getSiteCopy } from "@/lib/i18n/server";

/**
 * Titles RTA's news pages, which are client components and cannot export
 * metadata themselves: "News | RTA", in the reader's language.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getSiteCopy();
  return { title: t.news.title };
}

export default function RtaNewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
