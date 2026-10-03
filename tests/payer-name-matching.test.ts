import { describe, expect, it } from "vitest";
import {
  compareNames,
  nameAgreement,
  nameTokens,
  phoneVariants,
} from "@/lib/services/payment-matching";

/**
 * Matching a member by the name on a payment.
 *
 * The name confirms a phone match, and on its own credits only when it is
 * word for word one member's. These tests fix the boundary between "the same
 * person" and "two different people", because both mistakes are expensive:
 * too strict and a member's payment sits unattributed, too loose and money
 * reaches the wrong account.
 */

const tokens = (value: string) => nameTokens(value);

describe("names that correspond", () => {
  it("matches the same name", () => {
    expect(compareNames("Abdallah Nzabandola", tokens("ABDALLAH NZABANDOLA"))).toBe(
      "exact"
    );
  });

  it("matches regardless of word order", () => {
    // Rwandan names are commonly written surname-first on a statement and
    // given-name-first in a register. They are the same person.
    expect(compareNames("Abdallah Nzabandola", tokens("NZABANDOLA ABDALLAH"))).toBe(
      "exact"
    );
  });

  it("matches a name the bank truncated", () => {
    // Bank of Kigali cuts the counterparty field at sixteen characters, so
    // "Abdallah Nzabandola" arrives as "ABDALLAH NZABAND".
    expect(compareNames("Abdallah Nzabandola", tokens("ABDALLAH NZABAND"))).toBe(
      "partial"
    );
  });

  it("matches when the payer string carries an extra name", () => {
    expect(
      compareNames("Abdallah Nzabandola", tokens("ABDALLAH KARIM NZABANDOLA"))
    ).toBe("partial");
  });

  it("folds accents, because a bank and a register spell them differently", () => {
    expect(compareNames("Ndayisabé Paul", tokens("NDAYISABE PAUL"))).toBe("exact");
  });
});

describe("names that do not correspond", () => {
  it("rejects a different surname", () => {
    expect(compareNames("Abdallah Nzabandola", tokens("ABDALLAH MUGISHA"))).toBeNull();
  });

  it("rejects a single shared first name", () => {
    expect(compareNames("Jean Uwimana", tokens("JEAN HABIMANA"))).toBeNull();
  });

  it("refuses a match built only from approximate words", () => {
    // THE GUARD THAT MATTERS. "JEAN" is a legitimate four-letter prefix of
    // "JEANNETTE" and "MUKA" of "MUKAMANA", so without the requirement that
    // at least one word match outright, these two strangers would be
    // introduced to each other.
    expect(compareNames("Jeannette Mukamana", tokens("JEAN MUKA"))).toBeNull();
  });

  it("rejects a prefix shorter than four characters", () => {
    expect(compareNames("Eric Habimana", tokens("ERIC HAB"))).toBeNull();
  });

  it("rejects when a member's name has a word the payment does not", () => {
    expect(
      compareNames("Abdallah Karim Nzabandola", tokens("ABDALLAH NZABANDOLA"))
    ).toBeNull();
  });

  it("rejects empty input on either side", () => {
    expect(compareNames("", tokens("ABDALLAH NZABANDOLA"))).toBeNull();
    expect(compareNames("Abdallah Nzabandola", [])).toBeNull();
  });
});

describe("tokenising a name", () => {
  it("drops punctuation and initials", () => {
    expect(nameTokens("J. Uwimana")).toEqual(["UWIMANA"]);
  });

  it("folds accented characters", () => {
    expect(nameTokens("Ndayisabé")).toEqual(["NDAYISABE"]);
  });

  it("returns nothing for a blank name", () => {
    expect(nameTokens(null)).toEqual([]);
    expect(nameTokens("   ")).toEqual([]);
  });
});

describe("sender name confirming a phone match", () => {
  it("is full when the whole name is there", () => {
    expect(nameAgreement("Jean Uwimana", tokens("UWIMANA JEAN"))).toBe("full");
  });

  it("is some when only the surname is there", () => {
    expect(nameAgreement("Jean Claude Uwimana", tokens("UWIMANA J"))).toBe("some");
  });

  it("is none for a different person", () => {
    expect(nameAgreement("Jean Uwimana", tokens("GRACE MUKAMANA"))).toBe("none");
  });

  it("is none when there is no name", () => {
    expect(nameAgreement("Jean Uwimana", [])).toBe("none");
  });
});

describe("phone variants", () => {
  it("covers every stored form of a number", () => {
    for (const input of ["0788123456", "+250 788 123 456", "250788123456"]) {
      expect(phoneVariants(input), input).toEqual([
        "+250788123456",
        "250788123456",
        "0788123456",
        "788123456",
      ]);
    }
  });

  it("returns nothing for something that is not a phone number", () => {
    expect(phoneVariants("12345")).toEqual([]);
    expect(phoneVariants(null)).toEqual([]);
  });
});
