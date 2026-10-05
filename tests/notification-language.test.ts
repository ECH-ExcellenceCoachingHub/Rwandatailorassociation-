import { describe, expect, it } from "vitest";
import { renderEnglish, renderNotification } from "@/lib/notifications/templates";
import { NOTIFICATION_EVENTS, type NotificationEvent } from "@/lib/notifications/types";

const context = {
  firstName: "Aline",
  associationName: "RTA",
  paymentReference: "RTA-0042",
  amount: "500",
  balance: "12000",
  reference: "FIN-1",
  daysBehind: 7,
  daysUntilFine: 2,
  clearingAmount: "7850",
  fineAmount: "500",
  finePerShare: "500",
  fineShares: 1,
  dueDate: new Date("2026-10-05T12:00:00Z"),
  counterpartyName: "Jean",
  ruleTitle: "Daily saving",
};

const ALL_EVENTS = Object.values(NOTIFICATION_EVENTS) as NotificationEvent[];

describe("notification languages", () => {
  it("shows Kinyarwanda first, then English, in-app", () => {
    const rendered = renderNotification(NOTIFICATION_EVENTS.CONTRIBUTION_FINE_CHARGED, context);
    const english = renderEnglish(NOTIFICATION_EVENTS.CONTRIBUTION_FINE_CHARGED, context);

    expect(rendered.title).toBe(`Waciwe ihazabu / ${english.title}`);
    expect(rendered.body.endsWith(english.body)).toBe(true);
    expect(rendered.body.startsWith("Kubera ko wari ufite ibirarane by'iminsi 7")).toBe(true);
  });

  it("sends email in Kinyarwanda only", () => {
    for (const event of ALL_EVENTS) {
      const rendered = renderNotification(event, { ...context, reason: "x" });
      const english = renderEnglish(event, { ...context, reason: "x" });
      expect(rendered.emailText.startsWith("Muraho Aline,"), event).toBe(true);
      expect(rendered.emailText, event).not.toContain("Dear ");
      expect(rendered.emailText, event).not.toContain("English");
      expect(rendered.emailSubject, event).not.toBe(english.emailSubject);
    }
  });

  it("writes amounts in Frw and dates with the Kinyarwanda month", () => {
    const disbursed = renderNotification(NOTIFICATION_EVENTS.LOAN_DISBURSED, context);
    expect(disbursed.emailText).toContain("500 Frw");
    expect(disbursed.emailText).toContain("5 Ukwakira 2026");
    expect(disbursed.emailText).not.toContain("RWF");
  });

  it("sends SMS in Kinyarwanda only, in one segment", () => {
    const { sms } = renderNotification(NOTIFICATION_EVENTS.PAYMENT_RECEIVED, context);
    expect(sms).toBe("RTA: Twakiriye 500 Frw. Ubwizigame bwawe ubu ni 12,000 Frw. Nimero: FIN-1.");
    expect(sms!.length).toBeLessThanOrEqual(160);
  });

  it("keeps events without an SMS free of one", () => {
    expect(renderNotification(NOTIFICATION_EVENTS.PASSWORD_CHANGED, context).sms).toBeUndefined();
  });

  it("does not repeat an officer's own words", () => {
    const rendered = renderNotification(NOTIFICATION_EVENTS.ADMIN_ANNOUNCEMENT, {
      ...context,
      reason: "Inama ni ku wa gatandatu.",
    });
    expect(rendered.body).toBe("Inama ni ku wa gatandatu.");
    expect(rendered.sms).toBe("Inama ni ku wa gatandatu.");
    expect(rendered.emailText.match(/Inama/g)).toHaveLength(1);
  });

  it("uses no English words in SMS", () => {
    for (const event of ALL_EVENTS) {
      const { sms } = renderNotification(event, { ...context, reason: "x" });
      if (sms) expect(sms, event).not.toMatch(/\b(Ref|RWF|received|balance)\b/);
    }
  });

  it("keeps SMS in plain characters so it is not billed at the UCS-2 rate", () => {
    for (const event of ALL_EVENTS) {
      const { sms } = renderNotification(event, { ...context, reason: "x" });
      if (sms) expect(sms, event).toMatch(/^[\x20-\x7E\n]*$/);
    }
  });
});
