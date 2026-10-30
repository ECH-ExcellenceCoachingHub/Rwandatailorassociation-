"use client";

import { useState } from "react";
import BackButton from "@/components/BackButton";
import RegisterForm from "@/components/auth/RegisterForm";

export default function RegisterPageContent({
  sharePrice,
  dailyFee,
  association,
  backHref = "/",
  loginHref = "/login",
  heading = "Register",
}: {
  sharePrice: string;
  dailyFee: string;
  association: { code: string; name: string } | null;
  /// Where the back button goes: RTA's home on its own site, the association's
  /// home on /abc/register.
  backHref?: string;
  /// The association's own sign-in, offered once the application is in.
  loginHref?: string;
  heading?: string;
}) {
  const [registered, setRegistered] = useState(false);

  return (
    <section className="page-pad bg-background">
      <div className="container-page">
        <BackButton href={backHref} />

        {!registered && (
          <h2 className="mt-8 text-2xl font-bold text-ink text-center">
            {heading}
          </h2>
        )}

        <RegisterForm
          sharePrice={sharePrice}
          dailyFee={dailyFee}
          association={association}
          homeHref={backHref}
          loginHref={loginHref}
          onSuccess={() => setRegistered(true)}
        />
      </div>
    </section>
  );
}
