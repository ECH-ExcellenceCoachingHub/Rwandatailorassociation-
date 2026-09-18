"use client";

import Image from "next/image";
import SectionHeading from "@/components/SectionHeading";
import BackButton from "@/components/BackButton";
import RegisterForm from "@/components/auth/RegisterForm";
import { useLanguage } from "@/components/LanguageProvider";

/**
 * Membership registration.
 *
 * The page keeps its original layout — back button, SectionHeading, the same
 * container — but the Google Form iframe has been replaced by a native form
 * that writes into the association's own database.
 *
 * That change is what makes the rest of the platform possible: an application
 * now creates a member record, a membership number, a savings account and,
 * critically, a unique payment reference. Without a reference issued at
 * registration, incoming payments have nothing reliable to match on.
 *
 * THE STGT LOCKUP SITS ABOVE THE HEADING because this page is the seam between
 * the two names. The chrome around it is the association's website, but what
 * the form enrols somebody into is STGT — Save Today, Grow Tomorrow — its
 * savings programme, and that is the name every screen after this one carries.
 * Someone who only meets it on the far side of a sign-in has no way to know
 * they are in the right place.
 */
export default function RegisterPageContent({
  sharePrice,
  dailyFee,
}: {
  sharePrice: string;
  dailyFee: string;
}) {
  const { t, d } = useLanguage();
  // The brand strings live with the sign-in shell, which is the other place
  // this lockup appears. One brand, one pair of translations.
  const brand = d.auth.layout;

  return (
    <section className="page-pad bg-background">
      <div className="container-page">
        <BackButton href="/" />

        <div className="mt-6 flex flex-col items-center text-center">
          <span className="flex items-center gap-3">
            <Image
              src="/images/rtalogo.jpg"
              alt=""
              width={48}
              height={48}
              className="size-12 shrink-0 rounded-full object-cover"
            />
            <span className="text-left leading-tight">
              <span className="block font-heading text-xl font-bold tracking-[0.06em] text-ink">
                STGT
              </span>
              <span className="block font-heading text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary">
                {brand.brandTagline}
              </span>
            </span>
          </span>

          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            {brand.brandProgramme}
          </p>
        </div>

        <SectionHeading
          className="mt-8"
          kicker={t.contact.kicker}
          title={t.contact.registerTitle}
          description={t.contact.registerText}
        />

        <RegisterForm sharePrice={sharePrice} dailyFee={dailyFee} />
      </div>
    </section>
  );
}
