"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { CheckCircle2, Loader2, Pencil, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PublishToggle } from "@/components/dashboard/BorrowingForm";
import { useLanguage } from "@/components/LanguageProvider";
import { statusLabel } from "@/lib/i18n/dashboard/status";
import { useSiteRouter } from "@/hooks/use-site-paths";

/**
 * Recording what the association's money did.
 *
 * One form, two uses. Creating and updating differ only in what the fields
 * start out holding, because the same facts are being stated either way —
 * unlike a borrowing, where taking a facility on and repaying it are genuinely
 * different acts and get separate forms.
 *
 * The update case is the one that matters over time: a project is recorded when
 * the money goes out, and the benefit sentence and the returns figure are
 * filled in months later, when there is finally something true to write.
 */

const CATEGORIES = [
  "EQUIPMENT",
  "WORKSHOP_SPACE",
  "BULK_MATERIALS",
  "TRAINING",
  "MARKET_ACCESS",
  "PROPERTY",
  "MEMBER_LENDING",
  "EMERGENCY_FUND",
  "OTHER",
] as const;

const FUNDING_SOURCES = [
  "MEMBER_SAVINGS",
  "BANK_LOAN",
  "RETAINED_SURPLUS",
  "GRANT",
  "MIXED",
] as const;

const STATUSES = ["PLANNED", "ACTIVE", "COMPLETED", "PAUSED", "CANCELLED"] as const;

export interface FacilityOption {
  id: string;
  reference: string;
  lenderName: string;
}

export interface InvestmentDefaults {
  id: string;
  title: string;
  category: string;
  status: string;
  summary: string;
  description: string | null;
  benefitSummary: string | null;
  membersBenefited: number | null;
  fundingSource: string;
  fundedByLoanId: string | null;
  amountInvested: string;
  amountReturned: string;
  startedAt: Date | null;
  completedAt: Date | null;
  isPublic: boolean;
}

/** `<input type="date">` wants YYYY-MM-DD, and nothing else. */
function dateValue(date: Date | null): string | undefined {
  return date ? new Date(date).toISOString().slice(0, 10) : undefined;
}

function InvestmentDialog({
  trigger,
  title,
  description,
  defaults,
  facilities,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  defaults?: InvestmentDefaults;
  facilities: FacilityOption[];
}) {
  const router = useSiteRouter();
  const { d } = useLanguage();
  const copy = d.admin.investments;

  const [open, setOpen] = useState(false);
  const [isPublic, setIsPublic] = useState(defaults?.isPublic ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    const body = {
      title: form.get("title"),
      category: form.get("category"),
      status: form.get("status"),
      summary: form.get("summary"),
      description: form.get("description"),
      benefitSummary: form.get("benefitSummary"),
      membersBenefited: form.get("membersBenefited"),
      fundingSource: form.get("fundingSource"),
      // The empty option means "not from a facility", which the API must see
      // as null rather than as the string "".
      fundedByLoanId: form.get("fundedByLoanId") || null,
      amountInvested: form.get("amountInvested"),
      amountReturned: form.get("amountReturned"),
      startedAt: form.get("startedAt"),
      completedAt: form.get("completedAt"),
      isPublic,
    };

    try {
      const response = await fetch(
        defaults ? `/api/admin/investments/${defaults.id}` : "/api/admin/investments",
        {
          method: defaults ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? d.common.serverUnreachable);
        setFieldErrors(payload?.error?.details ?? {});
        return;
      }

      setSuccess(copy.saved);
      router.refresh();
      setTimeout(() => {
        setSuccess(null);
        setOpen(false);
      }, 1200);
    } catch {
      setError(d.common.serverUnreachable);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="mt-1">{description}</DialogDescription>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          {success && (
            <Alert variant="success">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {success}
              </span>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="title" label={copy.nameLabel} error={fieldErrors.title} required>
              {(props) => (
                <Input {...props} name="title" defaultValue={defaults?.title} required />
              )}
            </Field>

            <Field id="category" label={copy.category} error={fieldErrors.category}>
              {(props) => (
                <NativeSelect
                  {...props}
                  name="category"
                  defaultValue={defaults?.category ?? "EQUIPMENT"}
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {statusLabel(category, d.status)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>

          <Field id="summary" label={copy.summaryLabel} error={fieldErrors.summary} required>
            {(props) => (
              <Textarea {...props} name="summary" rows={2} defaultValue={defaults?.summary} required />
            )}
          </Field>

          {/* The sentence the whole feature exists for. Given the prompt as a
              hint rather than as placeholder text, because placeholder text
              disappears the moment someone starts typing — which is exactly
              when the instruction is needed. */}
          <Field
            id="benefitSummary"
            label={copy.benefitLabel}
            error={fieldErrors.benefitSummary}
            hint={copy.benefitPrompt}
          >
            {(props) => (
              <Textarea
                {...props}
                name="benefitSummary"
                rows={2}
                defaultValue={defaults?.benefitSummary ?? ""}
              />
            )}
          </Field>

          <Field id="description" label={copy.detailLabel} error={fieldErrors.description}>
            {(props) => (
              <Textarea
                {...props}
                name="description"
                rows={3}
                defaultValue={defaults?.description ?? ""}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              id="amountInvested"
              label={copy.amountInvested}
              error={fieldErrors.amountInvested}
              required
            >
              {(props) => (
                <Input
                  {...props}
                  name="amountInvested"
                  inputMode="decimal"
                  defaultValue={defaults?.amountInvested}
                  required
                />
              )}
            </Field>

            <Field
              id="amountReturned"
              label={copy.amountReturned}
              error={fieldErrors.amountReturned}
              hint={copy.amountReturnedHint}
            >
              {(props) => (
                <Input
                  {...props}
                  name="amountReturned"
                  inputMode="decimal"
                  defaultValue={defaults?.amountReturned}
                />
              )}
            </Field>

            <Field
              id="membersBenefited"
              label={copy.membersBenefitedLabel}
              error={fieldErrors.membersBenefited}
            >
              {(props) => (
                <Input
                  {...props}
                  name="membersBenefited"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={defaults?.membersBenefited ?? ""}
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="fundingSource"
              label={copy.fundingSource}
              error={fieldErrors.fundingSource}
            >
              {(props) => (
                <NativeSelect
                  {...props}
                  name="fundingSource"
                  defaultValue={defaults?.fundingSource ?? "MEMBER_SAVINGS"}
                >
                  {FUNDING_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {statusLabel(source, d.status)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field
              id="fundedByLoanId"
              label={copy.fundedByLabel}
              error={fieldErrors.fundedByLoanId}
            >
              {(props) => (
                <NativeSelect
                  {...props}
                  name="fundedByLoanId"
                  defaultValue={defaults?.fundedByLoanId ?? ""}
                >
                  <option value="">{copy.fundedByNone}</option>
                  {facilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.lenderName} · {facility.reference}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="status" label={copy.statusLabel} error={fieldErrors.status}>
              {(props) => (
                <NativeSelect {...props} name="status" defaultValue={defaults?.status ?? "ACTIVE"}>
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {statusLabel(value, d.status)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field id="startedAt" label={copy.startedAt} error={fieldErrors.startedAt}>
              {(props) => (
                <Input
                  {...props}
                  name="startedAt"
                  type="date"
                  defaultValue={dateValue(defaults?.startedAt ?? null)}
                />
              )}
            </Field>

            <Field id="completedAt" label={copy.completedAt} error={fieldErrors.completedAt}>
              {(props) => (
                <Input
                  {...props}
                  name="completedAt"
                  type="date"
                  defaultValue={dateValue(defaults?.completedAt ?? null)}
                />
              )}
            </Field>
          </div>

          <PublishToggle
            checked={isPublic}
            onChange={setIsPublic}
            label={copy.publish}
            hint={copy.publishHint}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {d.common.cancel}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {submitting ? d.common.saving : d.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewInvestmentButton({ facilities }: { facilities: FacilityOption[] }) {
  const { d } = useLanguage();
  const copy = d.admin.investments;

  return (
    <InvestmentDialog
      facilities={facilities}
      title={copy.formTitle}
      description={copy.formIntro}
      trigger={
        <Button>
          <Sprout className="size-4" aria-hidden="true" />
          {copy.addInvestment}
        </Button>
      }
    />
  );
}

export function EditInvestmentButton({
  investment,
  facilities,
}: {
  investment: InvestmentDefaults;
  facilities: FacilityOption[];
}) {
  const { d } = useLanguage();
  const copy = d.admin.investments;

  return (
    <InvestmentDialog
      facilities={facilities}
      defaults={investment}
      title={copy.editTitle}
      description={copy.editIntro}
      trigger={
        <Button variant="outline" size="sm">
          <Pencil className="size-3.5" aria-hidden="true" />
          {d.common.edit}
        </Button>
      }
    />
  );
}
