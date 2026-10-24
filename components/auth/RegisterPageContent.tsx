"use client";

import { useState } from "react";
import BackButton from "@/components/BackButton";
import RegisterForm from "@/components/auth/RegisterForm";

export default function RegisterPageContent({
  sharePrice,
  dailyFee,
}: {
  sharePrice: string;
  dailyFee: string;
}) {
  const [registered, setRegistered] = useState(false);

  return (
    <section className="page-pad bg-background">
      <div className="container-page">
        <BackButton href="/" />

        {!registered && (
          <h2 className="mt-8 text-2xl font-bold text-ink text-center">
            Register
          </h2>
        )}

        <RegisterForm
          sharePrice={sharePrice}
          dailyFee={dailyFee}
          onSuccess={() => setRegistered(true)}
        />
      </div>
    </section>
  );
}
