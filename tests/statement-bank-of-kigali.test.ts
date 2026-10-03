import { describe, expect, it } from "vitest";
import {
  extractPayerName,
  extractPayerPhone,
  parseStatementRows,
} from "@/lib/services/statement-import";

/**
 * Bank of Kigali statement parsing, from a real document.
 *
 * These lines are taken verbatim from a 45-page BK personal statement, and
 * they exist because that document broke the parser in a way no synthetic
 * fixture had caught.
 *
 * WHAT WENT WRONG. BK repeats a metadata block on every page:
 *
 *     Issued on :       2026-08-14 09:44:14
 *     Total Debits :    21,723,811
 *     Total Credits :   21,723,900
 *     Open Balance :    30
 *     Closing Balance : 119
 *
 * The parser read that block as a TRANSACTION — a date and several money
 * tokens is exactly what a transaction looks like — and did so once per page.
 * Forty-five identical phantom rows, each for over twenty million francs,
 * while the actual transactions were passed over. The amount even came out
 * wrong on top of that, because the trailing "14" of the timestamp ran into
 * the total beneath it and produced 421,723,811.
 *
 * A statement header must never be importable. That is what these tests pin
 * down, alongside the ordinary rows that do have to be read correctly.
 */

// The metadata block, exactly as it appears above the transactions.
const HEADER = `
Bank of Kigali Account Statement
Page 1 of 45
Customer Name : HASHIMU IMFURANSA
Phone Number : +250788535156
Address : KICUKIRO,UMUJYI WA KIGALI,RWANDA
Email : hashimuimfuransa@gmail.com
Period : 2024-12-03 To 2026-08-14
Account No: 100015893995
Account Name : IMFURANSA HASHIMU
Account Type : Individual Current Account
IBAN :
Currency : RWF
Issued on : 2026-08-14 09:44:14
Total Debits : 21,723,811
Total Credits : 21,723,900
Open Balance : 30
Closing Balance : 119
Book Date Value Date Reference Narration Debit Credit Balance
www.bk.rw (+250) 252 593 100 @bankofkigali
`;

// Real rows. BK prints two dates, a reference, a narration, then the amount in
// either the Debit or the Credit column, then the running balance.
const TRANSACTIONS = `
2024-12-03 2024-12-03 FT243380LZZ2 Incoming Trsf frm local banks | AFRICA BUSINESS NEWS RWANDA 0000017 1,236,000 1,236,030
2024-12-04 2024-12-04 FTCM24339HS101CKD ATM Cash Withdrawal Fee : AC-RWF1001252751038 | BKAD0044 027426 BK GIKONDO HP Offsi 300 1,235,730
2024-12-04 2024-12-04 FTCM24339HS101CKD ATM Cash Withdrawal | BKAD0044 027426 BK GIKONDO HP Offsi 200,000 1,035,730
2024-12-16 2024-12-16 FT24351QRM53 Incoming Trsf frm local banks | AFRICA BUSINESS NEWS RWANDA 0000017 1,275,900 1,276,430
2026-02-21 2026-02-21 FTCM2652ZQNXSPYV New App BK-BK Account Transfer : ABDALLAH NZABAND | contributionIMFURANSA HASHIMU 4,000,000 4,000,279
`;

describe("Bank of Kigali statement header", () => {
  it("never reads the metadata block as a transaction", () => {
    const { rows } = parseStatementRows(HEADER);

    // The whole point: a header cannot be imported as money.
    expect(rows).toHaveLength(0);
  });

  it("does not mistake the totals for an opening transaction", () => {
    const { rows } = parseStatementRows(HEADER);
    const amounts = rows.map((row) => row.amount);

    expect(amounts).not.toContain("21723811.00");
    expect(amounts).not.toContain("21723900.00");
    // The fused misreading that reached the admin's screen.
    expect(amounts).not.toContain("421723811.00");
  });

  it("still reads the account number and period out of the header", () => {
    const { detectedAccount, detectedPeriod } = parseStatementRows(HEADER);

    expect(detectedAccount).toBe("100015893995");
    expect(detectedPeriod.from).toBe("2024-12-03");
  });

  it("does not multiply phantom rows when the header repeats on every page", () => {
    // Three pages' worth of header, which is what produced 45 phantom rows.
    const { rows } = parseStatementRows(`${HEADER}${HEADER}${HEADER}`);
    expect(rows).toHaveLength(0);
  });
});

describe("Bank of Kigali transaction rows", () => {
  it("reads every transaction line", () => {
    const { rows } = parseStatementRows(TRANSACTIONS);
    expect(rows).toHaveLength(5);
  });

  it("reads the amount, not the running balance", () => {
    const { rows } = parseStatementRows(TRANSACTIONS);

    expect(rows[0].amount).toBe("1236000.00");
    expect(rows[0].balanceAfter).toBe("1236030.00");
  });

  it("separates the fee from the withdrawal it belongs to", () => {
    const { rows } = parseStatementRows(TRANSACTIONS);

    expect(rows[1].amount).toBe("300.00");
    expect(rows[2].amount).toBe("200000.00");
  });

  it("uses the running balance to tell a credit from a debit", () => {
    const { rows } = parseStatementRows(TRANSACTIONS);

    // Balance rose by exactly the amount → an incoming transfer.
    expect(rows[0].direction).toBe("CREDIT");
    // Balance fell by exactly the amount → a fee and a withdrawal.
    expect(rows[1].direction).toBe("DEBIT");
    expect(rows[2].direction).toBe("DEBIT");
  });

  it("reads the large incoming transfer correctly", () => {
    const { rows } = parseStatementRows(TRANSACTIONS);
    const contribution = rows.find((row) => row.rawLine.includes("ABDALLAH"));

    expect(contribution).toBeDefined();
    expect(contribution!.amount).toBe("4000000.00");
    expect(contribution!.direction).toBe("CREDIT");
  });

  it("keeps the bank's own reference for each entry", () => {
    const { rows } = parseStatementRows(TRANSACTIONS);
    expect(rows[0].bankReference).toBe("FT243380LZZ2");
  });

  it("gives every row a distinct identity", () => {
    const { rows } = parseStatementRows(TRANSACTIONS);
    const fingerprints = rows.map((row) => row.fingerprint);

    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });
});

describe("payer details in Bank of Kigali narrations", () => {
  it("reads the sender of an incoming bank transfer", () => {
    expect(
      extractPayerName(
        "Incoming Trsf frm local banks | AFRICA BUSINESS NEWS RWANDA 0000017"
      )
    ).toContain("AFRICA BUSINESS NEWS");
  });

  it("reads the sender of a BK-to-BK transfer", () => {
    expect(
      extractPayerName(
        "New App BK-BK Account Transfer : ABDALLAH NZABAND | contributionIMFURANSA HASHIMU"
      )
    ).toContain("ABDALLAH");
  });

  it("takes the counterparty, not words from the transaction reference", () => {
    // The reference cell is joined onto the narration when a row is read, and
    // scanning the whole string for capitalised words used to surface
    // "FTCM ZQNXSPYV NEW" — a reference fragment — as somebody's name.
    const name = extractPayerName(
      "FTCM2652ZQNXSPYV New App BK-BK Account Transfer : ABDALLAH NZABAND | contributionIMFURANSA HASHIMU"
    );

    expect(name).toBe("ABDALLAH NZABAND");
    expect(name).not.toContain("FTCM");
    expect(name).not.toContain("ZQNXSPYV");
  });

  it("reads the counterparty of an internal transfer", () => {
    expect(
      extractPayerName(
        "IB Account transfer : UWERA FARIDA am | Loan payment UWERA FARIDA amp UWA"
      )
    ).toContain("UWERA FARIDA");
  });

  it("reads the sender, not the receiving account, of an EKASH incoming transfer", () => {
    // The slot after the colon is the association's own account; the sender
    // follows the separator, which the PDF reader turns into a capital "I".
    expect(
      extractPayerName(
        "FTCM26261UCXLNOVR EKASH incoming transfer : RWANDA TAILORS A I Peruth MUNYANA2507835473513064886"
      )
    ).toBe("PERUTH MUNYANA");
  });

  it("reads the mobile number out of a mobile money line", () => {
    expect(
      extractPayerPhone(
        "MTN MOBILE MONEY NEW MOBISERVE : hh | 250788535156 hhHashimu IMFURANSA"
      )
    ).toBe("+250788535156");
  });

  it("does not read the account number as a phone number", () => {
    expect(extractPayerPhone("Account No: 100015893995")).toBeNull();
  });
});

describe("the Debit and Credit columns decide direction", () => {
  // When a statement is read as a table, the extractor appends DR or CR
  // because the amount sat in that column — the bank saying which way the
  // money went, rather than us inferring it from a balance.
  const WITH_COLUMNS = `
2024-12-03 2024-12-03 FT243380LZZ2 Incoming Trsf frm local banks | AFRICA BUSINESS NEWS RWANDA 0000017 1,236,000 1,236,030 CR
2024-12-04 2024-12-04 FTCM24339HS101CKD ATM Cash Withdrawal Fee : AC-RWF1001252751038 | BKAD0044 027426 BK GIKONDO HP Offsi 300 1,235,730 DR
`;

  it("reads the column marker as the direction", () => {
    const { rows } = parseStatementRows(WITH_COLUMNS);

    expect(rows[0].direction).toBe("CREDIT");
    expect(rows[1].direction).toBe("DEBIT");
  });

  it("keeps the narration once the column marker is stripped", () => {
    const { rows } = parseStatementRows(WITH_COLUMNS);

    expect(rows[0].description).toContain("AFRICA BUSINESS NEWS");
    // The marker itself is structure, not narration.
    expect(rows[0].description).not.toMatch(/\bCR\b/);
  });

  it("prefers the column over a running balance that does not add up", () => {
    // A row lifted out of sequence: the previous balance does not chain, so
    // the movement implies a credit while the column says debit.
    const OUT_OF_SEQUENCE = `
2024-12-03 2024-12-03 FT243380LZZ2 Opening | SOMEONE 100,000 500,000 CR
2024-12-16 2024-12-16 FTCM24350HNMTQ3KS MTN MOBILE MONEY | 250788535156 urugi 80,000 996,130 DR
`;
    const { rows } = parseStatementRows(OUT_OF_SEQUENCE);
    const mobileMoney = rows[1];

    expect(mobileMoney.direction).toBe("DEBIT");
    expect(mobileMoney.warnings.join(" ")).toMatch(/column was used/i);
  });
});

describe("a whole page parses as its transactions only", () => {
  it("counts only real transactions when header and rows are combined", () => {
    const { rows, coverage } = parseStatementRows(`${HEADER}${TRANSACTIONS}`);

    expect(rows).toHaveLength(5);
    // Every line is accounted for: nothing silently vanishes between the PDF
    // and the table the administrator approves.
    expect(coverage.linesRead).toBe(
      coverage.structuralLines +
        coverage.transactionLines +
        coverage.unparsedCount +
        coverage.otherLines
    );
  });
});
