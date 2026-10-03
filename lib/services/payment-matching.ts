import "server-only";
import { prisma, Prisma } from "@/lib/db/prisma";
import { paymentLogger } from "@/lib/logger";
import { phoneMatchKey } from "@/lib/phone";
import type { MatchStrategy } from "@/lib/generated/prisma/enums";
import type { ProviderTransaction } from "@/lib/jenga/types";

/**
 * MEMBER IDENTIFICATION FOR INBOUND PAYMENTS.
 *
 * Most members do not quote a reference. They send money from their phone, and
 * what reaches us is a phone number and a sender name. Those two together are
 * therefore the primary way a payment is attributed, and when they agree the
 * payment is credited automatically — no reference needed.
 *
 * Order of evidence:
 *   1. A quoted payment reference or membership number. Free to check, and
 *      unambiguous when present.
 *   2. PHONE NUMBER, corroborated by the SENDER NAME. The phone picks the
 *      member; the name confirms it. Phone + agreeing name credits
 *      automatically. A phone whose sender name names somebody else is held for
 *      review — that is what a recycled or borrowed number looks like.
 *   3. Registered bank account.
 *   4. SENDER NAME alone. Credits automatically only when it matches exactly one
 *      member, word for word, and no other member even partially. Anything
 *      looser is a suggestion for review.
 *
 * AMOUNT is deliberately absent: two members paying the same monthly
 * contribution are indistinguishable by amount.
 *
 * Where more than one member fits and nothing separates them the result is
 * AMBIGUOUS with zero confidence — never "pick the first". An ambiguous
 * payment is safer in the unmatched queue than in the wrong account.
 *
 * SPEED. Each step is a single indexed query and steps stop at the first
 * confident hit, so a typical phone payment costs one or two round trips.
 * Phone lookups compare against every stored format with an exact `IN` rather
 * than a suffix `LIKE`, which would scan the table.
 */

export interface MatchCandidate {
  memberId: string;
  memberNumber: string;
  fullName: string;
  paymentReference: string;
  savingsAccountId: string | null;
}

export interface MatchResult {
  strategy: MatchStrategy;
  /// 0–100. Compared against PAYMENT_AUTO_MATCH_MIN_CONFIDENCE.
  confidence: number;
  member: MatchCandidate | null;
  /// Populated when several members matched — the admin picks between them.
  candidates: MatchCandidate[];
  /// Human-readable justification, stored on the reconciliation record.
  evidence: string;
}

/**
 * Confidence by evidence, calibrated against the default threshold of 90.
 * Everything at or above 90 credits automatically; everything below waits for
 * an administrator.
 */
export const MATCH_CONFIDENCE = {
  MEMBER_PAYMENT_REFERENCE: 100,
  /// Phone matches one member and the sender name is that member's name.
  PHONE_AND_FULL_NAME: 99,
  EXTERNAL_CUSTOMER_REFERENCE: 96,
  /// Phone matches one member and the sender name shares part of it, e.g. the
  /// surname, or a name the bank truncated.
  PHONE_AND_PARTIAL_NAME: 96,
  BANK_ACCOUNT: 95,
  /// Several members share the phone, and the sender name picks out one.
  SHARED_PHONE_NAME_DECIDES: 95,
  /// Phone matches one member and no sender name came with the payment.
  PHONE_ONLY: 93,
  /// No phone match; the sender name matches exactly one member exactly.
  PAYER_NAME_EXACT: 90,
  /// The exact name match has a partial look-alike — review.
  PAYER_NAME_EXACT_WITH_LOOKALIKE: 80,
  /// Truncated or extra-word name, one candidate — review.
  PAYER_NAME_PARTIAL: 75,
  /// Phone matches one member but the sender name is somebody else — review.
  PHONE_NAME_CONFLICT: 70,
} as const;

const NO_MATCH: MatchResult = {
  strategy: "NONE",
  confidence: 0,
  member: null,
  candidates: [],
  evidence: "No usable identifier found on the payment",
};

/**
 * Attempts to identify the member a payment belongs to.
 *
 * @param associationId Restricts the search to one tenant. A payment must
 *   never be matched against a member of a different association.
 */
export async function matchPaymentToMember(
  transaction: ProviderTransaction,
  associationId: string,
  associationCode: string
): Promise<MatchResult> {
  // 1 — Quoted reference or membership number ------------------------------
  const searchText = [transaction.narration, transaction.transactionReference]
    .filter(Boolean)
    .join(" ");

  const byReference = await matchByQuotedReference(searchText, associationId, associationCode);
  if (byReference) return byReference;

  // 2 — Phone number, confirmed by the sender name --------------------------
  // The name is taken from the provider's payer field where there is one, and
  // otherwise from the narration — which is where a PDF statement import puts
  // it, since a bank statement line has no structured payer field.
  const byPhone = await matchByPhoneAndName(
    {
      phone: transaction.payerPhone ?? transaction.payerAccount,
      payerName: transaction.payerName,
      narration: transaction.narration,
    },
    associationId
  );
  if (byPhone) return byPhone;

  // 3 — Bank account -------------------------------------------------------
  if (transaction.payerAccount) {
    const matches = await findByBankAccount(transaction.payerAccount, associationId);

    if (matches.length === 1) {
      return {
        strategy: "BANK_ACCOUNT",
        confidence: MATCH_CONFIDENCE.BANK_ACCOUNT,
        member: matches[0],
        candidates: matches,
        evidence: `Payer bank account ${transaction.payerAccount} is registered to this member`,
      };
    }
    if (matches.length > 1) {
      return ambiguous("BANK_ACCOUNT", matches, `bank account ${transaction.payerAccount}`);
    }
  }

  // 4 — Sender name alone --------------------------------------------------
  const nameMatch = await matchByPayerName(
    transaction.payerName ?? transaction.narration,
    associationId
  );
  if (nameMatch) return nameMatch;

  paymentLogger.info(
    {
      externalTransactionId: transaction.externalTransactionId,
      hasNarration: Boolean(transaction.narration),
      hasPhone: Boolean(transaction.payerPhone),
      hasPayerName: Boolean(transaction.payerName),
    },
    "payment could not be matched to a member"
  );

  return NO_MATCH;
}

/**
 * Looks up every payment reference and membership number quoted in the text
 * in one query. A payment reference wins over a membership number.
 */
async function matchByQuotedReference(
  text: string,
  associationId: string,
  associationCode: string
): Promise<MatchResult | null> {
  const references = extractPaymentReferences(text, associationCode);
  const memberNumbers = extractMemberNumbers(text, associationCode);
  if (references.length === 0 && memberNumbers.length === 0) return null;

  const members = await prisma.member.findMany({
    where: {
      associationId,
      ...CREDITABLE_STATUS,
      OR: [
        { paymentReference: { in: references } },
        { memberNumber: { in: memberNumbers } },
      ],
    },
    select: MEMBER_SELECT,
  });

  for (const reference of references) {
    const member = members.find((m) => m.paymentReference === reference);
    if (member) {
      const candidate = toCandidate(member);
      return {
        strategy: "MEMBER_PAYMENT_REFERENCE",
        confidence: MATCH_CONFIDENCE.MEMBER_PAYMENT_REFERENCE,
        member: candidate,
        candidates: [candidate],
        evidence: `Payment reference "${reference}" found in the narration`,
      };
    }
  }

  for (const memberNumber of memberNumbers) {
    const member = members.find((m) => m.memberNumber === memberNumber);
    if (member) {
      const candidate = toCandidate(member);
      return {
        strategy: "EXTERNAL_CUSTOMER_REFERENCE",
        confidence: MATCH_CONFIDENCE.EXTERNAL_CUSTOMER_REFERENCE,
        member: candidate,
        candidates: [candidate],
        evidence: `Membership number "${memberNumber}" found in the narration`,
      };
    }
  }

  return null;
}

/**
 * Identifies a member by the paying phone number, using the sender name to
 * confirm the match or to pick between members who share the number.
 *
 * Returns null when the phone matches nobody, so the caller can move on to
 * weaker evidence.
 *
 * `payerName` is a structured sender-name field. `narration` is free text that
 * may or may not contain the name: a name found there confirms the match, but
 * a name NOT found there is not a contradiction, because most narrations
 * simply do not carry one.
 */
export async function matchByPhoneAndName(
  payer: { phone: string | null; payerName: string | null; narration?: string | null },
  associationId: string
): Promise<MatchResult | null> {
  const variants = phoneVariants(payer.phone);
  if (variants.length === 0) return null;

  const rows = await prisma.member.findMany({
    where: {
      associationId,
      ...CREDITABLE_STATUS,
      OR: [
        { mobileMoneyNumber: { in: variants } },
        { user: { phone: { in: variants } } },
      ],
    },
    select: { ...MEMBER_SELECT, mobileMoneyNumber: true },
    take: 10,
  });
  if (rows.length === 0) return null;

  const tokens = nameTokens(payer.payerName ?? payer.narration ?? null);
  const nameIsStructured = nameTokens(payer.payerName).length > 0;
  const senderName = tokens.join(" ");

  const scored = rows.map((row) => ({
    candidate: toCandidate(row),
    viaMobileMoney: row.mobileMoneyNumber !== null && variants.includes(row.mobileMoneyNumber),
    agreement: nameAgreement(`${row.user.firstName} ${row.user.lastName}`, tokens),
  }));

  const strategyFor = (s: (typeof scored)[number]): MatchStrategy =>
    s.viaMobileMoney ? "MOBILE_MONEY_ACCOUNT" : "PHONE_NUMBER";
  const phoneLabel = (s: (typeof scored)[number]) =>
    s.viaMobileMoney ? "registered mobile money number" : "account phone number";

  // One member owns this number ---------------------------------------------
  if (scored.length === 1) {
    const [only] = scored;
    const base = {
      strategy: strategyFor(only),
      member: only.candidate,
      candidates: [only.candidate],
    };

    if (only.agreement === "full") {
      return {
        ...base,
        confidence: MATCH_CONFIDENCE.PHONE_AND_FULL_NAME,
        evidence: `Payer phone matches this member's ${phoneLabel(only)} and the sender name "${senderName}" is theirs`,
      };
    }
    if (only.agreement === "some") {
      return {
        ...base,
        confidence: MATCH_CONFIDENCE.PHONE_AND_PARTIAL_NAME,
        evidence: `Payer phone matches this member's ${phoneLabel(only)} and the sender name "${senderName}" shares their name`,
      };
    }
    if (nameIsStructured) {
      // The number is theirs but the person sending is named as somebody
      // else: a recycled, borrowed or mistyped number. A human decides.
      return {
        ...base,
        confidence: MATCH_CONFIDENCE.PHONE_NAME_CONFLICT,
        evidence:
          `Payer phone matches ${only.candidate.fullName}'s ${phoneLabel(only)}, ` +
          `but the sender name "${senderName}" does not match — review required`,
      };
    }
    return {
      ...base,
      confidence: MATCH_CONFIDENCE.PHONE_ONLY,
      evidence: `Payer phone matches this member's ${phoneLabel(only)}; no sender name was given`,
    };
  }

  // Several members share this number — let the name decide -----------------
  const rank = { full: 2, some: 1, none: 0 } as const;
  const best = Math.max(...scored.map((s) => rank[s.agreement]));
  const leaders = scored.filter((s) => rank[s.agreement] === best);

  if (best > 0 && leaders.length === 1) {
    const [winner] = leaders;
    return {
      strategy: strategyFor(winner),
      confidence: MATCH_CONFIDENCE.SHARED_PHONE_NAME_DECIDES,
      member: winner.candidate,
      candidates: scored.map((s) => s.candidate),
      evidence:
        `${scored.length} members share this phone number; the sender name ` +
        `"${senderName}" identifies ${winner.candidate.fullName}`,
    };
  }

  return ambiguous(
    strategyFor(scored[0]),
    scored.map((s) => s.candidate),
    "phone number"
  );
}

/**
 * Identifies a member from the sender name alone.
 *
 * Credits automatically only for an exact name that belongs to exactly one
 * member, with no partial look-alike. Returns null rather than NO_MATCH when
 * nothing usable is found, so the caller can fall through to its own logging.
 */
export async function matchByPayerName(
  payerName: string | null,
  associationId: string
): Promise<MatchResult | null> {
  const tokens = nameTokens(payerName);

  // One token is not a person. "JOHN" or "UWIMANA" alone will match several
  // members in any association of size.
  if (tokens.length < 2) return null;

  const { exact, partial } = await findByName(tokens, associationId);
  const sender = tokens.join(" ");

  if (exact.length === 1) {
    const lookalike = partial.length > 0;
    return {
      strategy: "PAYER_NAME",
      confidence: lookalike
        ? MATCH_CONFIDENCE.PAYER_NAME_EXACT_WITH_LOOKALIKE
        : MATCH_CONFIDENCE.PAYER_NAME_EXACT,
      member: exact[0],
      candidates: [...exact, ...partial],
      evidence: lookalike
        ? `Sender name "${sender}" matches this member exactly, but ${partial.length} other member(s) have a similar name — review required`
        : `Sender name "${sender}" matches this member exactly, and no other member`,
    };
  }

  if (exact.length > 1) {
    return ambiguous("PAYER_NAME", exact, `name "${sender}"`);
  }

  if (partial.length === 1) {
    return {
      strategy: "PAYER_NAME",
      confidence: MATCH_CONFIDENCE.PAYER_NAME_PARTIAL,
      member: partial[0],
      candidates: partial,
      evidence:
        `The sender name "${sender}" corresponds to ${partial[0].fullName}, ` +
        `but not word for word (banks truncate this field) — review required`,
    };
  }

  if (partial.length > 1) {
    return ambiguous("PAYER_NAME", partial, `name "${sender}"`);
  }

  return null;
}

/**
 * Every stored form a Rwandan mobile number may take. Members' numbers are
 * normalised to E.164 on save, but older and seeded rows carry the local
 * "07…" form, so the lookup tries each form with an exact (indexed) match.
 */
export function phoneVariants(input: string | null | undefined): string[] {
  const key = phoneMatchKey(input);
  if (!key) return [];
  return [`+250${key}`, `250${key}`, `0${key}`, key];
}

/**
 * How far a sender name agrees with a member's name.
 *
 *   "full" — every word of the member's name is accounted for (see
 *            `compareNames`), in any order, allowing for truncation.
 *   "some" — at least one word of the member's name appears outright, or as a
 *            prefix of four letters or more. Enough to CONFIRM a phone match,
 *            never enough to make one.
 *   "none" — no shared word at all.
 */
export function nameAgreement(
  memberFullName: string,
  payerTokens: string[]
): "full" | "some" | "none" {
  if (payerTokens.length === 0) return "none";
  if (compareNames(memberFullName, payerTokens) !== null) return "full";

  const payerSet = new Set(payerTokens);
  for (const token of new Set(nameTokens(memberFullName))) {
    if (token.length >= 3 && coversMemberToken(token, payerSet)) return "some";
  }
  return "none";
}

function ambiguous(
  strategy: MatchStrategy,
  candidates: MatchCandidate[],
  identifier: string
): MatchResult {
  paymentLogger.warn(
    { strategy, candidateCount: candidates.length },
    "ambiguous payment match — routed for manual review"
  );

  return {
    strategy,
    // Zero, not "best guess". Several members share this identifier, so there
    // is no evidence favouring any one of them.
    confidence: 0,
    member: null,
    candidates,
    evidence: `${candidates.length} members share this ${identifier} — manual review required`,
  };
}

// Extraction ------------------------------------------------------------------

/**
 * Pulls candidate payment references out of free text.
 *
 * Payers are inconsistent: "RTA-000123", "RTA 000123", "rta000123" and
 * "Ref:RTA-000123" all appear in real narrations. Separators are normalised
 * away and the canonical form rebuilt, rather than demanding people type it
 * exactly.
 */
export function extractPaymentReferences(
  text: string | null,
  associationCode: string
): string[] {
  if (!text) return [];

  const code = associationCode.toUpperCase();
  const upper = text.toUpperCase();
  const found = new Set<string>();

  // CODE, then optional separators, then digits.
  const pattern = new RegExp(`${code}[\\s\\-_/.]*([0-9]{3,10})`, "g");

  for (const match of upper.matchAll(pattern)) {
    const digits = match[1];
    // Canonical form is 6 digits, zero-padded. Longer runs are taken as-is so
    // an over-long number is not silently truncated into a valid reference.
    found.add(`${code}-${digits.length <= 6 ? digits.padStart(6, "0") : digits}`);
  }

  return [...found];
}

/** Membership numbers take the form RTA-M000123. */
export function extractMemberNumbers(
  text: string | null,
  associationCode: string
): string[] {
  if (!text) return [];

  const code = associationCode.toUpperCase();
  const upper = text.toUpperCase();
  const found = new Set<string>();

  const pattern = new RegExp(`${code}[\\s\\-_/.]*M[\\s\\-_/.]*([0-9]{3,10})`, "g");

  for (const match of upper.matchAll(pattern)) {
    const digits = match[1];
    found.add(`${code}-M${digits.length <= 6 ? digits.padStart(6, "0") : digits}`);
  }

  return [...found];
}

/**
 * Normalises a name into comparable tokens.
 *
 * Accents are folded (NFD + mark stripping) because a bank writes "NDAYISABÉ"
 * and the register holds "Ndayisabe"; punctuation and initials are dropped.
 * Order is NOT preserved by the comparison below — Rwandan names are commonly
 * written surname-first on a bank statement and given-name-first in a member
 * register, and treating those as different people would defeat the purpose.
 */
export function nameTokens(value: string | null): string[] {
  if (!value) return [];

  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

// Lookups ---------------------------------------------------------------------
// Every query is scoped by associationId. Tenant isolation is not optional
// here: a reference collision across associations must not cross the boundary.

// `satisfies` rather than `as const`: the latter makes every property
// readonly, and Prisma's generated input types are mutable, so an `as const`
// select is rejected outright.
const MEMBER_SELECT = {
  id: true,
  memberNumber: true,
  paymentReference: true,
  user: { select: { firstName: true, lastName: true } },
  savingsAccounts: {
    where: { isActive: true },
    orderBy: { openedAt: "asc" },
    take: 1,
    select: { id: true },
  },
} satisfies Prisma.MemberSelect;

type MemberRow = {
  id: string;
  memberNumber: string;
  paymentReference: string;
  user: { firstName: string; lastName: string };
  savingsAccounts: { id: string }[];
};

function toCandidate(member: MemberRow): MatchCandidate {
  return {
    memberId: member.id,
    memberNumber: member.memberNumber,
    paymentReference: member.paymentReference,
    fullName: `${member.user.firstName} ${member.user.lastName}`.trim(),
    savingsAccountId: member.savingsAccounts[0]?.id ?? null,
  };
}

/** Members who may receive money. A suspended member's payment is held. */
const CREDITABLE_STATUS = { status: "ACTIVE" } satisfies Prisma.MemberWhereInput;

async function findByBankAccount(
  accountNumber: string,
  associationId: string
): Promise<MatchCandidate[]> {
  const cleaned = accountNumber.replace(/\s/g, "");
  if (cleaned.length < 6) return [];

  const members = await prisma.member.findMany({
    where: { associationId, bankAccountNumber: cleaned, ...CREDITABLE_STATUS },
    select: MEMBER_SELECT,
    take: 5,
  });
  return members.map(toCandidate);
}

/**
 * Shortest prefix accepted as evidence of a truncated name.
 *
 * Four characters, and never on its own — see `coversMemberToken`.
 */
const MIN_PREFIX = 4;

/**
 * Whether a payer token accounts for one of the member's name tokens.
 *
 * BANKS TRUNCATE. Bank of Kigali cuts the counterparty to sixteen characters,
 * so a transfer from Abdallah Nzabandora reaches the statement as
 * "ABDALLAH NZABAND" — the surname severed mid-word. Demanding an exact token
 * match rejects that member outright, which is the wrong answer: the payment
 * plainly came from them, and it ends up in the unmatched queue with no
 * suggestion at all.
 *
 * A prefix in either direction is therefore accepted. The guard against that
 * being too loose is not the length alone — "JEAN" is a legitimate four-letter
 * prefix of "JEANNETTE" — but the requirement in `classify` that at least one
 * other token match EXACTLY. One fuzzy token can never carry a match by itself.
 */
function coversMemberToken(memberToken: string, payerTokens: Set<string>): "exact" | "prefix" | null {
  if (payerTokens.has(memberToken)) return "exact";

  for (const payerToken of payerTokens) {
    const shorter = payerToken.length <= memberToken.length ? payerToken : memberToken;
    const longer = payerToken.length <= memberToken.length ? memberToken : payerToken;

    if (shorter.length >= MIN_PREFIX && longer.startsWith(shorter)) return "prefix";
  }

  return null;
}

/**
 * How well a member's name corresponds to the name on a payment.
 *
 *   "exact"   — the same words, in any order, none of them approximate.
 *   "partial" — every word accounted for, but something was truncated or the
 *               payer string carried an extra name.
 *   null      — not the same person, as far as this can tell.
 *
 * Exported for testing: the rule that stops a pair of loose prefixes putting
 * one member's money in another's account is worth a test of its own.
 */
export function compareNames(
  memberFullName: string,
  payerTokens: string[]
): "exact" | "partial" | null {
  const memberSet = new Set(nameTokens(memberFullName));
  const payerSet = new Set(payerTokens);

  if (memberSet.size === 0 || payerSet.size === 0) return null;

  let exactTokens = 0;
  let prefixTokens = 0;

  for (const token of memberSet) {
    const how = coversMemberToken(token, payerSet);
    if (how === "exact") exactTokens++;
    else if (how === "prefix") prefixTokens++;
    else return null; // a part of the member's name is unaccounted for
  }

  // At least one word must match outright. Without this, two approximate
  // prefixes could introduce complete strangers to one another.
  if (exactTokens === 0) return null;

  return prefixTokens === 0 && memberSet.size === payerSet.size ? "exact" : "partial";
}

/**
 * Finds members whose name matches the payer's.
 *
 * Narrowed in the database first, so this never loads the whole register to
 * compare strings. The narrowing has to allow for truncation too: an equality
 * filter alone would not retrieve Nzabandora when the statement says NZABAND,
 * so each token is also tried as a prefix.
 *
 * `exact` means the two names are the same set of tokens, in any order.
 * `partial` covers the truncated and middle-name cases. Anything weaker is not
 * returned at all: a single shared token is not evidence.
 */
async function findByName(
  tokens: string[],
  associationId: string
): Promise<{ exact: MatchCandidate[]; partial: MatchCandidate[] }> {
  const nameFilters: Prisma.UserWhereInput[] = [
    { firstName: { in: tokens, mode: "insensitive" } },
    { lastName: { in: tokens, mode: "insensitive" } },
  ];

  // Truncated tokens: "NZABAND" must still retrieve "Nzabandora".
  for (const token of tokens) {
    if (token.length < MIN_PREFIX) continue;
    nameFilters.push({ firstName: { startsWith: token, mode: "insensitive" } });
    nameFilters.push({ lastName: { startsWith: token, mode: "insensitive" } });
  }

  const members = await prisma.member.findMany({
    where: {
      associationId,
      ...CREDITABLE_STATUS,
      user: { OR: nameFilters },
    },
    select: MEMBER_SELECT,
    // Bounded: beyond a handful of same-name candidates the result is
    // ambiguous anyway, and the admin has to choose regardless.
    take: 25,
  });

  const exact: MatchCandidate[] = [];
  const partial: MatchCandidate[] = [];

  for (const member of members) {
    const verdict = compareNames(
      `${member.user.firstName} ${member.user.lastName}`,
      tokens
    );

    if (verdict === "exact") exact.push(toCandidate(member));
    else if (verdict === "partial") partial.push(toCandidate(member));
  }

  return { exact, partial };
}
