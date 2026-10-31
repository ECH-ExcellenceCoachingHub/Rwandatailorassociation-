"use client";

import { useState } from "react";

import { Loader2, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/LanguageProvider";
import { useSiteRouter } from "@/hooks/use-site-paths";

/**
 * Opens a savings account for a member of staff, on their own login.
 *
 * The button is only rendered for someone the server has already established
 * is eligible — staff, in an association, with no member record, holding
 * `members.create`. That check is repeated in the route handler, which is what
 * actually decides; this is only about not showing a control that would fail.
 *
 * On success it refreshes rather than navigating: the same page then re-renders
 * with a balance, a membership number and a payment reference where the staff
 * panel used to be, which is the clearest possible confirmation that it worked.
 */
export function EnrolAsMemberButton() {
  const router = useSiteRouter();
  const { d } = useLanguage();
  const copy = d.account.status;

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function enrol() {
    setBusy(true);
    setFailed(false);

    try {
      const response = await fetch("/api/account/member-enrolment", {
        method: "POST",
      });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      router.refresh();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <p className="text-sm leading-relaxed">{copy.openSavingsBody}</p>

      <Button size="sm" className="mt-3" disabled={busy} onClick={() => void enrol()}>
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <PiggyBank className="size-3.5" aria-hidden="true" />
        )}
        {busy ? copy.opening : copy.openSavingsAction}
      </Button>

      {failed && (
        <p className="mt-2 text-sm font-medium text-red-600">
          {copy.openSavingsFailed}
        </p>
      )}
    </div>
  );
}
