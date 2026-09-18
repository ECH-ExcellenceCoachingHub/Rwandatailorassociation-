import type { Metadata } from "next";
import { Cog, Percent, Users } from "lucide-react";
import { requirePermission, resolveAssociationScope } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listLoanProducts } from "@/lib/services/admin-queries";
import { formatMoney, isZero } from "@/lib/money";
import { getDashboardCopy } from "@/lib/i18n/server";
import { fill, pluralize } from "@/lib/i18n/fill";
import { PageHeader } from "@/components/dashboard/DashboardShell";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The browser tab follows the reader's language like the rest of the page.
 * A function rather than a constant because the title comes from the
 * request's locale cookie, which a module-level value cannot see.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.admin.products.title} | RTA`,
  };
}

export const dynamic = "force-dynamic";

export default async function AdminLoanProductsPage() {
  const context = await requirePermission(
    PERMISSIONS.LOAN_PRODUCTS_MANAGE,
    "/admin/loans/products"
  );
  const associationId = resolveAssociationScope(context);
  const { d } = await getDashboardCopy();
  const copy = d.admin.products;

  const products = await listLoanProducts(associationId);
  const currency = context.association?.currency ?? "RWF";

  /** "PERCENTAGE" fees are a rate; "FIXED" ones are an amount. */
  function formatCharge(type: string, value: string): string {
    if (isZero(value)) return d.common.none;
    return type === "PERCENTAGE"
      ? `${value}%`
      : formatMoney(value, { currency, showSymbol: false });
  }

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      {products.length === 0 ? (
        <EmptyState
          icon={Cog}
          title={copy.noneTitle}
          description={copy.noneBody}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {products.map((product) => (
            <article
              key={product.id}
              className="rounded-2xl border border-border bg-surface p-5 shadow-card"
            >
              <header className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-heading text-lg font-semibold text-ink">
                    {product.name}
                  </h2>
                  <p className="mt-0.5 font-mono text-xs text-ink-muted">
                    {product.code}
                  </p>
                  {product.description && (
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                      {product.description}
                    </p>
                  )}
                </div>
                <StatusBadge
                  status={product.isActive ? "ACTIVE" : "INACTIVE"}
                  size="sm"
                />
              </header>

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Highlight
                  icon={Percent}
                  label={copy.interest}
                  value={`${product.interestRate}%`}
                  hint={`${product.interestPeriod.toLowerCase()}, ${product.interestMethod
                    .replace(/_/g, " ")
                    .toLowerCase()}`}
                />
                <Highlight
                  icon={Cog}
                  label={copy.amount}
                  value={formatMoney(product.maxAmount, {
                    currency,
                    showSymbol: false,
                  })}
                  hint={fill(copy.minAmount, {
                    amount: formatMoney(product.minAmount, {
                      currency,
                      showSymbol: false,
                    }),
                  })}
                />
                <Highlight
                  icon={Users}
                  label={copy.inUse}
                  value={String(product.loanCount)}
                  hint={pluralize(copy.applicationCount, product.applicationCount)}
                />
              </div>

              <dl className="divide-y divide-border text-sm">
                <Row
                  label={copy.eligibility}
                  value={pluralize(
                    copy.eligibilityValue,
                    product.minimumMembershipMonths,
                    {
                      amount: formatMoney(product.minimumSavings, {
                        currency,
                        showSymbol: false,
                      }),
                      months: product.minimumMembershipMonths,
                    }
                  )}
                />
                <Row
                  label={copy.multiplier}
                  value={`${fill(copy.multiplierValue, {
                    factor: product.savingsMultiplier,
                  })}${
                    product.absoluteMaxAmount
                      ? fill(copy.cappedAt, {
                          amount: formatMoney(product.absoluteMaxAmount, {
                            currency,
                            showSymbol: false,
                          }),
                        })
                      : ""
                  }`}
                />
                <Row
                  label={copy.term}
                  value={fill(copy.termValue, {
                    min: product.minTermMonths,
                    max: product.maxTermMonths,
                    frequency: product.defaultFrequency.toLowerCase(),
                  })}
                />
                <Row
                  label={copy.processingFee}
                  value={formatCharge(
                    product.processingFeeType,
                    product.processingFeeValue
                  )}
                />
                <Row
                  label={copy.insuranceFee}
                  value={formatCharge(
                    product.insuranceFeeType,
                    product.insuranceFeeValue
                  )}
                />
                <Row
                  label={copy.latePenalty}
                  value={`${formatCharge(product.penaltyType, product.penaltyValue)}${
                    product.penaltyGraceDays > 0
                      ? pluralize(copy.graceDays, product.penaltyGraceDays)
                      : ""
                  }`}
                />
                {/* Not the product's own setting: the rulebook decides. A
                    member borrowing within their own share needs no
                    guarantor; above it, guarantors cover the difference. */}
                <Row label={copy.guarantors} value={copy.guarantorsAboveShare} />
                <Row
                  label={copy.collateral}
                  value={
                    product.requiresCollateral ? copy.required : copy.notRequired
                  }
                />
                <Row
                  label={copy.concurrent}
                  value={
                    product.singleActiveLoan
                      ? copy.singleLoan
                      : copy.multipleAllowed
                  }
                />
              </dl>
            </article>
          ))}
        </div>
      )}

      <p className="rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed text-ink-muted">
        {copy.advisoryNote}
      </p>
    </div>
  );
}

function Highlight({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Cog;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/50 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        <Icon className="size-3" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 font-heading text-base font-bold tabular-nums text-ink">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] capitalize text-ink-muted">{hint}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
