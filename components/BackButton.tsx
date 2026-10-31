"use client";

import Link from "@/components/SiteLink";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

export default function BackButton({ href }: { href: string }) {
  const { t } = useLanguage();

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-hover"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t.common.back}
    </Link>
  );
}
