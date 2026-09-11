"use client";

import SectionHeading from "@/components/SectionHeading";
import BackButton from "@/components/BackButton";
import RegisterForm from "@/components/auth/RegisterForm";
import { useLanguage } from "@/components/LanguageProvider";

/**
 * Membership registration.
 *
 * The page keeps its original layout — back button, SectionHeading, the same
 * container and spacing — but the Google Form iframe has been replaced by a
 * native form that writes into the association's own database.
 *
 * That change is what makes the rest of the platform possible: an application
 * now creates a member record, a membership number, a savings account and,
 * critically, a unique payment reference. Without a reference issued at
 * registration, incoming payments have nothing reliable to match on.
 */
export default function RegisterPageContent({
  sharePrice,
  dailyFee,
}: {
  sharePrice: string;
  dailyFee: string;
}) {
  const { t } = useLanguage();

  return (
    <section className="section-pad bg-background">
      <div className="container-page">
        <BackButton href="/" />

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
