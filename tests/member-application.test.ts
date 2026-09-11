import { describe, expect, it } from "vitest";
import { registerSchema } from "@/lib/validation/auth";
import { createMemberSchema, updateMemberSchema } from "@/lib/validation/members";

/**
 * The association's application questions: shares, a company and — for those
 * with one — interns, and a successor who may act for the member.
 *
 * The public form is strict — the applicant is present to answer — while the
 * desk form records whatever the paper application says, blanks included.
 */

const applicant = {
  firstName: "Jean",
  lastName: "Uwimana",
  email: "jean@example.com",
  phone: "0788123456",
  password: "Tailor-Strong-Pass-2026!",
  confirmPassword: "Tailor-Strong-Pass-2026!",
  acceptedTerms: true,
  sharesSubscribed: "5",
  hasCompany: "NO",
};

describe("public registration", () => {
  it("records the shares as a number and the answer as a boolean", () => {
    const parsed = registerSchema.parse(applicant);
    expect(parsed.sharesSubscribed).toBe(5);
    expect(parsed.hasCompany).toBe(false);
  });

  it("insists on a share count between 1 and 30", () => {
    for (const shares of ["", "0", "31", "2.5", "abc"]) {
      const parsed = registerSchema.safeParse({ ...applicant, sharesSubscribed: shares });
      expect(parsed.success, `shares = "${shares}"`).toBe(false);
    }
  });

  it("insists on an answer to the company question", () => {
    const parsed = registerSchema.safeParse({ ...applicant, hasCompany: "" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["hasCompany"]);
  });

  it("asks about interns only of someone with a company", () => {
    expect(registerSchema.safeParse(applicant).success).toBe(true);

    const unanswered = registerSchema.safeParse({ ...applicant, hasCompany: "YES" });
    expect(unanswered.success).toBe(false);
    expect(unanswered.error?.issues[0]?.path).toEqual(["acceptsInterns"]);
  });

  it("wants a capacity beside a yes", () => {
    const parsed = registerSchema.safeParse({
      ...applicant,
      hasCompany: "YES",
      acceptsInterns: "YES",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["internCapacity"]);

    const answered = registerSchema.parse({
      ...applicant,
      hasCompany: "YES",
      acceptsInterns: "YES",
      internCapacity: "3",
    });
    expect(answered.acceptsInterns).toBe(true);
    expect(answered.internCapacity).toBe(3);
  });

  it("drops interns answers left behind a change of answer", () => {
    const noCompany = registerSchema.parse({
      ...applicant,
      acceptsInterns: "YES",
      internCapacity: "4",
    });
    expect(noCompany.acceptsInterns).toBeUndefined();
    expect(noCompany.internCapacity).toBeUndefined();

    const noInterns = registerSchema.parse({
      ...applicant,
      hasCompany: "YES",
      acceptsInterns: "NO",
      internCapacity: "4",
    });
    expect(noInterns.acceptsInterns).toBe(false);
    expect(noInterns.internCapacity).toBeUndefined();
  });

  it("normalises the successor's phone, and leaves the successor optional", () => {
    expect(registerSchema.parse(applicant).successorName).toBeUndefined();

    const parsed = registerSchema.parse({
      ...applicant,
      successorName: "Marie Uwase",
      successorPhone: "0788654321",
      successorRelation: "Sister",
    });
    expect(parsed.successorPhone).toBe("+250788654321");

    const invalid = registerSchema.safeParse({ ...applicant, successorPhone: "12" });
    expect(invalid.success).toBe(false);
  });
});

describe("desk enrolment and editing", () => {
  const base = { firstName: "Jean", lastName: "Uwimana", phone: "0788123456" };

  it("accepts a file with none of the application answers", () => {
    const parsed = createMemberSchema.parse({
      ...base,
      sharesSubscribed: "",
      hasCompany: "",
      acceptsInterns: "",
      internCapacity: "",
    });
    expect(parsed.sharesSubscribed).toBeUndefined();
    // Never asked is not the same as "no".
    expect(parsed.hasCompany).toBeUndefined();
    expect(parsed.acceptsInterns).toBeUndefined();
    expect(parsed.internCapacity).toBeUndefined();
  });

  it("records more than 30 shares, which the public form cannot", () => {
    expect(createMemberSchema.parse({ ...base, sharesSubscribed: "40" }).sharesSubscribed).toBe(40);
  });

  it("keeps a yes without a capacity, and drops interns answers without a company", () => {
    expect(
      updateMemberSchema.parse({ ...base, hasCompany: "YES", acceptsInterns: "YES" })
        .acceptsInterns
    ).toBe(true);

    const withoutCompany = updateMemberSchema.parse({
      ...base,
      hasCompany: "NO",
      acceptsInterns: "YES",
      internCapacity: "2",
    });
    expect(withoutCompany.acceptsInterns).toBeUndefined();
    expect(withoutCompany.internCapacity).toBeUndefined();
  });
});
