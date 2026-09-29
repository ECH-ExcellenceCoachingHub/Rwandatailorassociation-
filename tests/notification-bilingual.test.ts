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
  dueDate: new Date("2026-10-05T00:00:00Z"),
  counterpartyName: "Jean",
  ruleTitle: "Daily saving",
};

describe("bilingual notifications", () => {
  it("sends every message in Kinyarwanda first, then English", () => {
    const rendered = renderNotification(NOTIFICATION_EVENTS.CONTRIBUTION_FINE_CHARGED, context);
    const english = renderEnglish(NOTIFICATION_EVENTS.CONTRIBUTION_FINE_CHARGED, context);

    expect(rendered.title).toBe(`Wahawe ihazabu / ${english.title}`);
    expect(rendered.body.endsWith(english.body)).toBe(true);
    expect(rendered.body.startsWith("Wari ufite iminsi 7")).toBe(true);
    expect(rendered.emailText.indexOf("Muraho Aline")).toBeLessThan(
      rendered.emailText.indexOf("Dear Aline")
    );
    expect(rendered.emailText).toContain("English");
  });

  it("sends SMS in Kinyarwanda only, in one segment", () => {
    const { sms } = renderNotification(NOTIFICATION_EVENTS.PAYMENT_RECEIVED, context);
    expect(sms).toMatch(/^RTA: twakiriye RWF 500/);
    expect(sms).not.toContain("received");
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

  it("has a Kinyarwanda half for every event", () => {
    for (const event of Object.values(NOTIFICATION_EVENTS) as NotificationEvent[]) {
      if (event === NOTIFICATION_EVENTS.ADMIN_ANNOUNCEMENT) continue;
      const rendered = renderNotification(event, { ...context, reason: "x" });
      const english = renderEnglish(event, { ...context, reason: "x" });
      expect(rendered.emailSubject, event).not.toBe(english.emailSubject);
      // Kinyarwanda text, the divider, then the English email unchanged.
      const [kinyarwanda] = rendered.emailText.split("\nEnglish\n");
      expect(rendered.emailText.endsWith(english.emailText), event).toBe(true);
      expect(kinyarwanda, event).not.toContain(english.emailText);
      expect(kinyarwanda.length, event).toBeGreaterThan(60);
    }
  });

  it("keeps SMS in plain characters so it is not billed at the UCS-2 rate", () => {
    for (const event of Object.values(NOTIFICATION_EVENTS) as NotificationEvent[]) {
      const { sms } = renderNotification(event, { ...context, reason: "x" });
      if (sms) expect(sms, event).toMatch(/^[\x20-\x7E\n]*$/);
    }
  });
});
