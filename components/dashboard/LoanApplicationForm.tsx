"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Info, Loader2, Search, Send, UserCheck, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  add,
  divide,
  formatMoney,
  gt,
  lt,
  multiply,
  parseMoneyInput,
  subtract,
  toMoney,
  toMoneyString,
} from "@/lib/money";
import { generateSchedule } from "@/lib/services/loan-calculator";
import { assessBorrowing, MAX_GUARANTORS, type BlockerRule } from "@/lib/rules/borrowing";
import { useLanguage } from "@/components/LanguageProvider";
import { fill, pluralize, split } from "@/lib/i18n/fill";
import { formatDate } from "@/lib/i18n/dates";
import type { AssociationPolicy } from "@/lib/services/rulebook";
import type { MemberCopy } from "@/lib/i18n/dashboard/member";
import type { ChargeType, InterestMethod, RepaymentFrequency } from "@/lib/generated/prisma/enums";

/**
 * Loan application form, decided by the rulebook.
 *
 * WHY THIS RUNS `assessBorrowing` IN THE BROWSER. It is the same function the
 * server decides with, and it is deliberately pure and not server-only for
 * exactly this reason. The figure a member is shown before they apply is then
 * the figure they are judged against when they do.
 *
 * This form used to be driven by the LOAN PRODUCT instead — it offered a
 * ceiling of three times savings, a term of up to 24 months, and a preview
 * carrying a processing and an insurance fee. The rulebook allows 80% of a
 * member's own savings without collateral, three months, and no charges of
 * any kind. (Three times savings is now the rulebook's own ceiling, STGT
 * Art. 34 — but enforced from the rulebook, not the product.) So the form invited requests the server then refused, with a rule the
 * member had never been shown. That is how a committee comes to look as though
 * it is playing favourites.
 *
 * The product is still what prices the schedule, because it is what the server
 * builds the real instalments from at disbursement — but it is now configured
 * to restate the rulebook rather than compete with it. Nothing on this screen
 * reads the product's own savings multiple, minimum balance or tenure gate.
 *
 * THE SENTENCES ARE NOT WRITTEN HERE. Every refusal is rendered from
 * `d.rules.blockers`, the same bilingual map the member's rulebook page uses,
 * filled with the parameters `assessBorrowing` returns. A second set of
 * wording on this screen would be a second set of rules.
 */

interface Product {
  id: string;
  name: string;
  description: string | null;
  interestRate: string;
  interestMethod: InterestMethod;
  minAmount: string;
  maxAmount: string;
  minTermMonths: number;
  maxTermMonths: number;
  allowedFrequencies: RepaymentFrequency[];
  defaultFrequency: RepaymentFrequency;
  processingFeeType: ChargeType;
  processingFeeValue: string;
  insuranceFeeType: ChargeType;
  insuranceFeeValue: string;
  singleActiveLoan: boolean;
}

/**
 * One guarantor as the borrower is naming them: what they typed to find the
 * member, who it found, and how much that member is asked to cover.
 */
interface GuarantorDraft {
  key: number;
  query: string;
  member: { memberId: string; fullName: string; memberNumber: string } | null;
  amount: string;
  looking: boolean;
  error: string | null;
}

/**
 * Refusals about the member rather than about this request.
 *
 * These are shown once at the top, because nothing the member types into the
 * form below can change them today. Everything else is rendered against the
 * field it concerns, where it can actually be acted on.
 */
const STANDING_BLOCKERS: ReadonlySet<BlockerRule> = new Set<BlockerRule>([
  "LENDING_NOT_OPEN",
  "MEMBERSHIP_TOO_SHORT",
  "IN_ARREARS",
  "FINE_OUTSTANDING",
  "ACTIVE_LOAN",
]);

function frequencyLabel(value: string, copy: MemberCopy["apply"]): string {
  const key = `freq${value}` as keyof MemberCopy["apply"];
  return (copy[key] as string | undefined) ?? value;
}

export function LoanApplicationForm({
  products,
  policy,
  savingsBalance,
  membershipMonths,
  associationMonths,
  missedDays,
  outstandingFines,
  hasActiveLoan,
}: {
  products: Product[];
  policy: AssociationPolicy;
  savingsBalance: string;
  membershipMonths: number;
  associationMonths: number;
  missedDays: number;
  outstandingFines: string;
  hasActiveLoan: boolean;
}) {
  const router = useRouter();
  const { d, locale } = useLanguage();
  const copy = d.member.apply;
  const ruleCopy = d.rules;

  const [productId, setProductId] = useState(products[0].id);
  const [amount, setAmount] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [purpose, setPurpose] = useState("");
  const [collateralDescription, setCollateralDescription] = useState("");
  const [collateralValue, setCollateralValue] = useState("");
  const [guarantors, setGuarantors] = useState<GuarantorDraft[]>([]);
  const [nextGuarantorKey, setNextGuarantorKey] = useState(1);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const product = products.find((p) => p.id === productId)!;

  // LOAN_REPAYMENT_FREQUENCY: "Repayment is monthly, on the same date each
  // month." There is no choice to offer, so none is drawn.
  const frequency: RepaymentFrequency = "MONTHLY";

  // The rulebook's term, not the product's. Capped rather than defaulted to
  // the product minimum, so the field starts on something the rules allow.
  const maxTerm = policy.loanMaxTermMonths;
  const effectiveTerm = termMonths || String(Math.min(product.minTermMonths, maxTerm));

  const parsedAmount = useMemo(() => {
    const parsed = parseMoneyInput(amount, { allowZero: false });
    return parsed.ok ? toMoneyString(parsed.value) : null;
  }, [amount]);

  const parsedTerm = useMemo(() => {
    const term = Number(effectiveTerm);
    return Number.isInteger(term) && term >= 1 ? term : null;
  }, [effectiveTerm]);

  /** Each guarantor's amount, when it is a valid positive figure. */
  const guarantorAmounts = useMemo(
    () =>
      guarantors.map((g) => {
        const parsed = parseMoneyInput(g.amount, { allowZero: false });
        return parsed.ok ? toMoneyString(parsed.value) : null;
      }),
    [guarantors]
  );

  /// What the found guarantors pledge together. Rows still being filled in
  /// count for nothing until they name a member and a valid amount.
  const pledgedTotal = useMemo(
    () =>
      toMoneyString(
        add(
          0,
          ...guarantors.map((g, i) => (g.member && guarantorAmounts[i]) || "0")
        )
      ),
    [guarantors, guarantorAmounts]
  );

  /**
   * The rulebook's verdict, recomputed as the member types.
   *
   * Given the whole request — amount, term, what guarantors pledge and anything
   * pledged as items — so the arithmetic below is the association's own, not
   * an approximation of it.
   */
  const assessment = useMemo(
    () =>
      assessBorrowing({
        policy,
        savingsBalance,
        membershipMonths,
        associationMonths,
        missedDays,
        outstandingFines,
        hasActiveLoan,
        requestedAmount: parsedAmount,
        collateralValue: collateralValue.trim() || null,
        guaranteedAmount: pledgedTotal,
        termMonths: parsedTerm,
      }),
    [
      policy,
      savingsBalance,
      membershipMonths,
      associationMonths,
      missedDays,
      outstandingFines,
      hasActiveLoan,
      parsedAmount,
      collateralValue,
      pledgedTotal,
      parsedTerm,
    ]
  );

  /** One blocker by rule, rendered in the reader's language. */
  function blockerText(rule: BlockerRule): string | null {
    const blocker = assessment.blockers.find((b) => b.rule === rule);
    return blocker ? fill(ruleCopy.blockers[blocker.rule], blocker.params) : null;
  }

  const standingBlockers = assessment.blockers.filter((b) =>
    STANDING_BLOCKERS.has(b.rule)
  );

  // The preview runs the SAME schedule the server builds at disbursement, so
  // the instalment shown is the instalment charged.
  const preview = useMemo(() => {
    if (!parsedAmount || !parsedTerm) return null;
    try {
      return generateSchedule({
        principal: parsedAmount,
        annualRate: product.interestRate,
        method: product.interestMethod,
        termMonths: parsedTerm,
        frequency,
        processingFeeType: product.processingFeeType,
        // LOAN_NO_EXTRA_CHARGES, applied here as well as at disbursement so
        // the preview can never quote a fee the rules forbid.
        processingFeeValue: policy.loanNoExtraCharges ? "0" : product.processingFeeValue,
        insuranceFeeType: product.insuranceFeeType,
        insuranceFeeValue: policy.loanNoExtraCharges ? "0" : product.insuranceFeeValue,
      });
    } catch {
      return null;
    }
  }, [parsedAmount, parsedTerm, product, frequency, policy]);

  /**
   * The half of the interest that comes back.
   *
   * Derived from the policy's two point values here rather than imported,
   * because `memberInterestShare` lives in the server-only rulebook module and
   * cannot cross into the browser. Taken off the schedule's own interest total
   * so this line and the line above it are halves of one number.
   */
  const interestBack = useMemo(() => {
    if (!preview) return null;
    const total = add(policy.interestMemberPoints, policy.interestAssociationPoints);
    if (!total.greaterThan(0)) return toMoneyString(0);
    return toMoneyString(
      multiply(preview.totalInterest, divide(policy.interestMemberPoints, total))
    );
  }, [preview, policy]);

  const amountTooSmall =
    parsedAmount && lt(parsedAmount, product.minAmount) && gt(product.minAmount, 0)
      ? fill(copy.amountTooSmall, {
          product: product.name,
          amount: formatMoney(product.minAmount),
        })
      : null;

  // GUARANTORS ONLY ABOVE THE OWN SHARE. Within it the member borrows on their
  // own savings and nobody else is asked for anything, whatever the loan
  // product says; above it, guarantors cover the difference.
  const needsGuarantors =
    policy.collateralRequiredAboveShare && gt(assessment.aboveOwnShare, 0);

  // Items can back whatever guarantors leave uncovered.
  const needsCollateral = needsGuarantors && gt(assessment.uncoveredAboveShare, 0);

  const pledgedOver = needsGuarantors
    ? subtract(pledgedTotal, assessment.aboveOwnShare)
    : toMoney(0);

  // A row the member started but did not finish: no member found yet, or no
  // valid amount. Either would be dropped silently on submit, so it blocks.
  const guarantorIncomplete = guarantors.some(
    (g, i) => (g.query.trim() || g.amount.trim()) && (!g.member || !guarantorAmounts[i])
  );

  const guarantorIssue = !needsGuarantors
    ? null
    : guarantorIncomplete
      ? copy.guarantorIncomplete
      : gt(pledgedOver, 0)
        ? fill(copy.guarantorsOver, { over: formatMoney(toMoneyString(pledgedOver)) })
        : null;

  const canSubmit =
    assessment.requestAllowed &&
    preview !== null &&
    !amountTooSmall &&
    !guarantorIssue &&
    purpose.trim().length >= 10 &&
    !submitting;

  function updateGuarantor(key: number, change: Partial<GuarantorDraft>) {
    setGuarantors((current) =>
      current.map((g) => (g.key === key ? { ...g, ...change } : g))
    );
  }

  /** Adds a row, offering whatever is still uncovered as its amount. */
  function addGuarantor() {
    const remaining = subtract(assessment.aboveOwnShare, pledgedTotal);
    setGuarantors((current) => [
      ...current,
      {
        key: nextGuarantorKey,
        query: "",
        member: null,
        amount: gt(remaining, 0) ? toMoneyString(remaining) : "",
        looking: false,
        error: null,
      },
    ]);
    setNextGuarantorKey((k) => k + 1);
  }

  /**
   * Finds the member the borrower means. By member number or phone, exact
   * match only; the server returns a name to confirm and nothing else.
   */
  async function findGuarantor(draft: GuarantorDraft) {
    const query = draft.query.trim();
    if (!query) return;

    updateGuarantor(draft.key, { looking: true, error: null, member: null });

    try {
      const response = await fetch(`/api/members/lookup?q=${encodeURIComponent(query)}`);
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        updateGuarantor(draft.key, {
          looking: false,
          error: response.status === 404 ? copy.guarantorNotFound : (payload?.error?.message ?? copy.guarantorNotFound),
        });
        return;
      }

      const member = payload.member as GuarantorDraft["member"] & object;

      if (guarantors.some((g) => g.key !== draft.key && g.member?.memberId === member.memberId)) {
        updateGuarantor(draft.key, { looking: false, error: copy.guarantorDuplicate });
        return;
      }

      updateGuarantor(draft.key, { looking: false, member, error: null });
    } catch {
      updateGuarantor(draft.key, { looking: false, error: d.common.serverUnreachable });
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      const response = await fetch("/api/loan-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanProductId: productId,
          amount: parsedAmount ?? amount,
          purpose: purpose.trim(),
          termMonths: Number(effectiveTerm),
          frequency,
          // Sent only when the rules call for them; within the own share the
          // server would refuse guarantors as unneeded.
          guarantors: needsGuarantors
            ? guarantors.flatMap((g, i) =>
                g.member && guarantorAmounts[i]
                  ? [{ memberId: g.member.memberId, amount: guarantorAmounts[i] }]
                  : []
              )
            : [],
          ...(needsCollateral && collateralDescription.trim()
            ? {
                collateralDescription: collateralDescription.trim(),
                collateralValue: collateralValue.trim() || undefined,
              }
            : {}),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        if (payload?.error?.details) setFieldErrors(payload.error.details);
        setError(payload?.error?.message ?? copy.submitFailed);
        setSubmitting(false);
        return;
      }

      setSuccess(payload.reference);
      router.refresh();
    } catch {
      setError(d.common.serverUnreachable);
      setSubmitting(false);
    }
  }

  const [successBefore, successAfter] = split(copy.successBody, "reference");

  if (success) {
    return (
      <Alert variant="success" title={copy.successTitle}>
        {successBefore}
        <strong>{success}</strong>
        {successAfter}{" "}
        <a href="/dashboard/loans" className="font-semibold underline">
          {copy.trackIt}
        </a>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-3" noValidate>
      <div className="space-y-5 lg:col-span-2">
        {error && <Alert variant="error">{error}</Alert>}

        {fieldErrors._ && (
          <Alert variant="error" title={ruleCopy.member.cannotBorrowYet}>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {fieldErrors._.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </Alert>
        )}

        {/* Why this member cannot borrow at all today. Nothing below can
            change these, so they are stated once, at the top, in the same
            words the member's rulebook page uses. */}
        {standingBlockers.length > 0 && (
          <Alert variant="warning" title={ruleCopy.member.cannotBorrowYet}>
            <p className="mb-1.5 font-medium">{ruleCopy.member.whatIsStopping}</p>
            <ul className="list-inside list-disc space-y-1">
              {standingBlockers.map((blocker) => (
                <li key={blocker.rule}>
                  {fill(ruleCopy.blockers[blocker.rule], blocker.params)}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <Field id="loan-product" label={copy.productLabel} required>
            {() => (
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger id="loan-product">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {fill(copy.productOption, {
                        name: p.name,
                        // The rulebook's monthly rate, which is what the member
                        // was told. The product's annual figure restates it.
                        rate: toMoney(policy.loanMonthlyInterest)
                          .toDecimalPlaces(2)
                          .toString(),
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          {product.description && (
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              {product.description}
            </p>
          )}

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field
              id="loan-amount"
              label={copy.amountLabel}
              error={
                amountTooSmall ??
                blockerText("AMOUNT") ??
                blockerText("ABOVE_MAXIMUM") ??
                fieldErrors.amount
              }
              hint={fill(copy.amountHint, {
                amount: formatMoney(assessment.ownShareLimit),
              })}
              required
            >
              {(props) => (
                <Input
                  {...props}
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={assessment.ownShareLimit}
                />
              )}
            </Field>

            <Field
              id="loan-term"
              label={copy.termLabel}
              error={blockerText("TERM_TOO_LONG")}
              hint={fill(copy.termHint, { max: maxTerm })}
              required
            >
              {(props) => (
                <Input
                  {...props}
                  inputMode="numeric"
                  value={termMonths}
                  onChange={(e) => setTermMonths(e.target.value)}
                  placeholder={String(Math.min(product.minTermMonths, maxTerm))}
                />
              )}
            </Field>
          </div>

          {/* Monthly, by rule. Shown rather than chosen. */}
          <div className="mt-5">
            <Field id="loan-frequency" label={copy.frequencyLabel}>
              {() => (
                <p
                  id="loan-frequency"
                  className="rounded-xl border border-border bg-canvas px-3 py-2.5 text-sm font-medium text-ink"
                >
                  {frequencyLabel(frequency, copy)}
                </p>
              )}
            </Field>
          </div>

          <div className="mt-5">
            <Field
              id="loan-purpose"
              label={copy.purposeLabel}
              error={fieldErrors.purpose}
              hint={copy.purposeHint}
              required
            >
              {(props) => (
                <Textarea
                  {...props}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder={copy.purposePlaceholder}
                  rows={3}
                />
              )}
            </Field>
          </div>
        </div>

        {/* GUARANTORS, above the own share and only there. Each is a member
            found by member number or phone, with the amount they cover; the
            amounts together must reach the part above the own share. */}
        {needsGuarantors && (
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <h3 className="font-heading text-base font-semibold text-ink">
              {copy.guarantorsTitle}
            </h3>
            <p className="mt-1.5 text-sm text-ink-muted">
              {fill(copy.guarantorsIntro, {
                own: formatMoney(assessment.ownShareLimit),
                above: formatMoney(assessment.aboveOwnShare),
              })}
            </p>

            <div className="mt-4 space-y-3">
              {guarantors.map((g, index) => (
                <div
                  key={g.key}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      {fill(copy.guarantorNumber, { number: index + 1 })}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setGuarantors((current) => current.filter((x) => x.key !== g.key))
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-red-700"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                      {copy.guarantorRemove}
                    </button>
                  </div>

                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {g.member ? (
                      <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <span className="min-w-0 text-sm">
                          <span className="flex items-center gap-1.5 font-semibold text-ink">
                            <UserCheck className="size-4 shrink-0 text-emerald-700" aria-hidden="true" />
                            <span className="truncate">{g.member.fullName}</span>
                          </span>
                          <span className="block font-mono text-xs text-ink-muted">
                            {g.member.memberNumber}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => updateGuarantor(g.key, { member: null })}
                          className="shrink-0 text-xs font-semibold text-primary-hover underline-offset-4 hover:underline"
                        >
                          {copy.guarantorChange}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <label
                          htmlFor={`guarantor-${g.key}-query`}
                          className="mb-1 block text-xs font-medium text-ink"
                        >
                          {copy.guarantorLookupLabel}
                        </label>
                        <div className="flex gap-2">
                          <Input
                            id={`guarantor-${g.key}-query`}
                            value={g.query}
                            onChange={(e) =>
                              updateGuarantor(g.key, { query: e.target.value, error: null })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void findGuarantor(g);
                              }
                            }}
                            placeholder={copy.guarantorLookupPlaceholder}
                            aria-invalid={g.error ? true : undefined}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void findGuarantor(g)}
                            disabled={g.looking || !g.query.trim()}
                          >
                            {g.looking ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <Search className="size-4" aria-hidden="true" />
                            )}
                            {copy.guarantorFind}
                          </Button>
                        </div>
                        {g.error && (
                          <p className="mt-1 text-xs font-medium text-red-600">{g.error}</p>
                        )}
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor={`guarantor-${g.key}-amount`}
                        className="mb-1 block text-xs font-medium text-ink"
                      >
                        {copy.guarantorAmountLabel}
                      </label>
                      <Input
                        id={`guarantor-${g.key}-amount`}
                        inputMode="decimal"
                        value={g.amount}
                        onChange={(e) => updateGuarantor(g.key, { amount: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={addGuarantor}
              disabled={guarantors.length >= MAX_GUARANTORS}
            >
              <UserPlus className="size-4" aria-hidden="true" />
              {copy.guarantorAdd}
            </Button>

            {/* The running total, against the one figure that matters. */}
            <div className="mt-4 rounded-xl bg-background px-3 py-2.5 text-sm">
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ink-muted">
                  {fill(copy.guarantorsCovered, {
                    covered: formatMoney(assessment.guaranteed),
                    above: formatMoney(assessment.aboveOwnShare),
                  })}
                </span>
                {gt(assessment.uncoveredAboveShare, 0) ? (
                  <span className="font-semibold text-amber-700">
                    {fill(copy.guarantorsRemaining, {
                      remaining: formatMoney(assessment.uncoveredAboveShare),
                    })}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-semibold text-emerald-700">
                    <Check className="size-4" aria-hidden="true" />
                    {copy.guarantorsComplete}
                  </span>
                )}
              </p>
            </div>

            {guarantorIssue && (
              <p className="mt-2 text-xs font-medium text-red-600">{guarantorIssue}</p>
            )}

            <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-ink-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {copy.guarantorsHowItWorks}
            </p>
          </div>
        )}

        {/* Whatever guarantors leave uncovered can be backed by pledged items
            instead — machines, materials — at the collateral coverage rate. */}
        {needsCollateral && (
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <h3 className="font-heading text-base font-semibold text-ink">
              {copy.collateralTitle}
            </h3>

            <p className="mt-1.5 text-sm text-ink-muted">
              {fill(copy.collateralIntro, {
                uncovered: formatMoney(assessment.uncoveredAboveShare),
                required: formatMoney(assessment.collateralRequired),
              })}
            </p>

            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <Field
                id="collateral-description"
                label={copy.collateralDescriptionLabel}
                hint={copy.collateralDescriptionHint}
                error={fieldErrors.collateralDescription}
                required
              >
                {(props) => (
                  <Input
                    {...props}
                    value={collateralDescription}
                    onChange={(e) => setCollateralDescription(e.target.value)}
                  />
                )}
              </Field>

              <Field
                id="collateral-value"
                label={copy.collateralValueLabel}
                hint={copy.collateralValueHint}
                error={fieldErrors.collateralValue}
                required
              >
                {(props) => (
                  <Input
                    {...props}
                    inputMode="decimal"
                    value={collateralValue}
                    onChange={(e) => setCollateralValue(e.target.value)}
                    placeholder={assessment.collateralRequired}
                  />
                )}
              </Field>
            </div>

            {assessment.collateralSatisfied && gt(assessment.collateralRequired, 0) && (
              <p className="mt-3 text-sm font-medium text-emerald-700">
                {copy.collateralSatisfied}
              </p>
            )}
          </div>
        )}

        <Button type="submit" size="lg" disabled={!canSubmit}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {d.common.submitting}
            </>
          ) : (
            <>
              <Send className="size-4" aria-hidden="true" />
              {copy.submitApplication}
            </>
          )}
        </Button>
      </div>

      {/* Live repayment preview */}
      <aside className="lg:col-span-1">
        <div className="sticky top-24 rounded-2xl border border-primary/25 bg-primary-50 p-5">
          <h3 className="font-heading text-base font-semibold text-primary-hover">
            {copy.previewTitle}
          </h3>

          {!preview ? (
            <p className="mt-3 text-sm text-primary-hover/80">{copy.previewEmpty}</p>
          ) : (
            <>
              <dl className="mt-4 space-y-2.5 text-sm">
                <Line
                  label={copy.lineLoanAmount}
                  value={formatMoney(preview.principal)}
                />
                {/* No processing or insurance line: LOAN_NO_EXTRA_CHARGES says
                    there are none, so what the member receives is the whole
                    of what they borrowed. */}
                <Line
                  label={copy.lineYouReceive}
                  value={formatMoney(preview.netDisbursement)}
                  strong
                />
                <div className="border-t border-primary/20 pt-2.5">
                  <Line
                    label={fill(copy.lineInterest, {
                      rate: toMoney(policy.loanMonthlyInterest)
                        .toDecimalPlaces(2)
                        .toString(),
                    })}
                    value={formatMoney(preview.totalInterest)}
                  />
                  {interestBack && (
                    <Line
                      label={copy.lineInterestBack}
                      value={`− ${formatMoney(interestBack)}`}
                    />
                  )}
                  {interestBack && (
                    <Line
                      label={copy.lineNetCost}
                      value={formatMoney(
                        toMoneyString(subtract(preview.totalInterest, interestBack))
                      )}
                    />
                  )}
                  <Line
                    label={copy.lineTotalRepay}
                    value={formatMoney(preview.totalPayable)}
                    strong
                  />
                </div>
              </dl>

              <div className="mt-4 rounded-xl bg-white/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary-hover">
                  {fill(copy.paymentLabel, {
                    frequency: frequencyLabel(frequency, copy),
                  })}
                </p>
                <p className="mt-1 font-heading text-xl font-bold text-primary-hover">
                  {formatMoney(preview.instalments[0].totalDue)}
                </p>
                <p className="mt-1 text-xs text-primary-hover/75">
                  {fill(copy.paymentsCount, {
                    count: preview.instalments.length,
                    date: formatDate(preview.instalments[0].dueDate, locale),
                  })}
                </p>
              </div>

              <p className="mt-3 flex items-start gap-1.5 text-xs text-primary-hover/75">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {copy.previewNote}
              </p>
            </>
          )}
        </div>
      </aside>
    </form>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "font-semibold text-primary-hover" : "text-primary-hover/80"}>
        {label}
      </dt>
      <dd
        className={`tabular-nums ${strong ? "font-heading text-base font-bold text-primary-hover" : "font-medium text-primary-hover"}`}
      >
        {value}
      </dd>
    </div>
  );
}
