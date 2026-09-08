"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  CheckCircle2,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  Scale,
  Trash2,
  Undo2,
  Wallet,
} from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useLanguage } from "@/components/LanguageProvider";
import { statusLabel } from "@/lib/i18n/dashboard/status";
import { formatMoney } from "@/lib/money";
import { formatQuantity } from "@/lib/quantity";

/**
 * Every write the warehouse screen performs.
 *
 * Held in one file the way InvestmentForm is, because these dialogs share the
 * whole of their submit machinery and differ only in their fields — and
 * because the three of them that move stock have to keep the same shape as
 * each other for an officer to trust what they do.
 *
 * WHY THE DIALOGS ARE KEYED ON `open`. Each body is remounted on every
 * opening, so a reason typed into a write-off and abandoned is not still
 * sitting there the next time the dialog opens against a different item. On a
 * form whose free text becomes an audit justification, showing the last one is
 * an easy way to have it submitted again by mistake.
 */

const CATEGORIES = [
  "FABRIC",
  "THREAD_AND_TRIM",
  "MACHINE",
  "MACHINE_PART",
  "TOOL",
  "PACKAGING",
  "CONSUMABLE",
  "FINISHED_GOODS",
  "OTHER",
] as const;

const TERMS = ["PURCHASE", "LOAN_OUT", "AGAINST_LOAN", "FREE_ISSUE"] as const;

export interface ItemOption {
  id: string;
  sku: string;
  name: string;
  unit: string;
  unitPrice: string;
  quantityOnHand: string;
}

export interface MemberOption {
  id: string;
  memberNumber: string;
  name: string;
}

export interface LoanOption {
  id: string;
  memberId: string;
  reference: string;
}

export interface ItemDefaults {
  id: string;
  sku: string;
  name: string;
  nameRw: string | null;
  category: string;
  unit: string;
  unitCost: string;
  unitPrice: string;
  reorderLevel: string;
  quantityOnHand: string;
  notes: string | null;
  isActive: boolean;
}

export interface IssuanceLineSummary {
  id: string;
  itemName: string;
  unit: string;
  quantityOutstanding: string;
}

export interface IssuanceSummary {
  id: string;
  reference: string;
  memberName: string;
  amountOwed: string;
  currency: string;
  lines: IssuanceLineSummary[];
}

// ---------------------------------------------------------------------------
// Shared submit machinery
// ---------------------------------------------------------------------------

interface SubmitState {
  submitting: boolean;
  error: string | null;
  fieldErrors: Record<string, string[]>;
  success: string | null;
}

const IDLE: SubmitState = {
  submitting: false,
  error: null,
  fieldErrors: {},
  success: null,
};

/**
 * One dialog shell: trigger, heading, error and success banners, and a submit
 * that POSTs JSON and refreshes the server components behind it.
 */
function WarehouseDialog({
  trigger,
  title,
  description,
  endpoint,
  method = "POST",
  buildBody,
  submitLabel,
  tone = "default",
  children,
  wide,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  endpoint: string;
  method?: "POST" | "PATCH";
  /// Returns the request body, or null to abort (a client-side guard failed).
  buildBody: (form: FormData) => unknown | null;
  submitLabel: string;
  tone?: "default" | "danger";
  children: (state: SubmitState) => ReactNode;
  wide?: boolean;
}) {
  const router = useRouter();
  const { d } = useLanguage();
  const copy = d.admin.warehouse;

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SubmitState>(IDLE);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = buildBody(form);
    if (body === null) return;

    setState({ ...IDLE, submitting: true });

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // 204 carries no body; parsing it unconditionally would throw on the one
      // path that succeeded.
      const payload =
        response.status === 204 ? null : await response.json().catch(() => null);

      if (!response.ok) {
        setState({
          submitting: false,
          error: payload?.error?.message ?? d.common.serverUnreachable,
          fieldErrors: payload?.error?.details ?? {},
          success: null,
        });
        return;
      }

      setState({ ...IDLE, success: copy.saved });
      router.refresh();
      setTimeout(() => {
        setState(IDLE);
        setOpen(false);
      }, 1200);
    } catch {
      setState({ ...IDLE, error: d.common.serverUnreachable });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setState(IDLE);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={wide ? "max-w-3xl" : "max-w-xl"}>
        <div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="mt-1">{description}</DialogDescription>
        </div>

        {/* Keyed on `open` so every opening starts from empty fields. */}
        <form key={open ? "open" : "closed"} onSubmit={handleSubmit} className="space-y-4">
          {state.error && <Alert variant="error">{state.error}</Alert>}
          {state.success && (
            <Alert variant="success">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {state.success}
              </span>
            </Alert>
          )}

          {children(state)}

          <div className="flex justify-end gap-2 pt-2">
            {/* Danger is a colour override on the primary button rather than a
                variant of its own — the same treatment ConfirmDialog gives a
                destructive confirmation, so the two read alike. */}
            <Button
              type="submit"
              className={tone === "danger" ? "bg-red-600 hover:bg-red-700" : undefined}
              disabled={state.submitting}
            >
              {state.submitting && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {state.submitting ? copy.saving : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Blank optional fields must reach the API as null, never as "". */
function text(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

function ItemFields({
  state,
  defaults,
}: {
  state: SubmitState;
  defaults?: ItemDefaults;
}) {
  const { d } = useLanguage();
  const copy = d.admin.warehouse;
  const errors = state.fieldErrors;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* The stock code is the identity of the line. Changing it later would
            orphan the movement history, so it is set once and then read-only. */}
        {!defaults && (
          <Field id="sku" label={copy.sku} error={errors.sku} required>
            {(props) => <Input {...props} name="sku" required maxLength={40} />}
          </Field>
        )}

        <Field id="name" label={copy.itemName} error={errors.name} required>
          {(props) => (
            <Input {...props} name="name" defaultValue={defaults?.name} required />
          )}
        </Field>

        <Field id="nameRw" label={copy.itemNameRw} error={errors.nameRw}>
          {(props) => (
            <Input {...props} name="nameRw" defaultValue={defaults?.nameRw ?? ""} />
          )}
        </Field>

        <Field id="category" label={copy.category} error={errors.category}>
          {(props) => (
            <NativeSelect
              {...props}
              name="category"
              defaultValue={defaults?.category ?? "FABRIC"}
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {statusLabel(category, d.status)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>

        <Field
          id="unit"
          label={copy.unit}
          hint={copy.unitHint}
          error={errors.unit}
          required
        >
          {(props) => (
            <Input
              {...props}
              name="unit"
              defaultValue={defaults?.unit ?? "piece"}
              required
              maxLength={24}
            />
          )}
        </Field>

        <Field
          id="unitCost"
          label={copy.unitCost}
          hint={copy.unitCostHint}
          error={errors.unitCost}
          required
        >
          {(props) => (
            <Input
              {...props}
              name="unitCost"
              inputMode="decimal"
              defaultValue={defaults?.unitCost}
              required
            />
          )}
        </Field>

        <Field
          id="unitPrice"
          label={copy.unitPrice}
          hint={copy.unitPriceHint}
          error={errors.unitPrice}
          required
        >
          {(props) => (
            <Input
              {...props}
              name="unitPrice"
              inputMode="decimal"
              defaultValue={defaults?.unitPrice}
              required
            />
          )}
        </Field>

        <Field
          id="reorderLevel"
          label={copy.reorderLevel}
          hint={copy.reorderLevelHint}
          error={errors.reorderLevel}
        >
          {(props) => (
            <Input
              {...props}
              name="reorderLevel"
              inputMode="decimal"
              defaultValue={defaults?.reorderLevel ?? "0"}
            />
          )}
        </Field>

        {/* Opening stock is only offered when the item is being created. On an
            existing line the way to change the count is an adjustment, which
            carries a reason. */}
        {!defaults && (
          <Field
            id="openingQuantity"
            label={copy.openingQuantity}
            hint={copy.openingQuantityHint}
            error={errors.openingQuantity}
          >
            {(props) => (
              <Input {...props} name="openingQuantity" inputMode="decimal" />
            )}
          </Field>
        )}
      </div>

      <Field id="notes" label={copy.notes} error={errors.notes}>
        {(props) => (
          <Textarea
            {...props}
            name="notes"
            rows={2}
            defaultValue={defaults?.notes ?? ""}
          />
        )}
      </Field>
    </>
  );
}

export function NewItemButton() {
  const { d } = useLanguage();
  const copy = d.admin.warehouse;

  return (
    <WarehouseDialog
      trigger={
        <Button size="sm">
          <PackagePlus className="size-3.5" aria-hidden="true" />
          {copy.addItem}
        </Button>
      }
      title={copy.addItem}
      description={copy.noItemsBody}
      endpoint="/api/admin/warehouse/items"
      submitLabel={copy.addItem}
      buildBody={(form) => ({
        sku: form.get("sku"),
        name: form.get("name"),
        nameRw: text(form, "nameRw"),
        category: form.get("category"),
        unit: form.get("unit"),
        unitCost: form.get("unitCost"),
        unitPrice: form.get("unitPrice"),
        reorderLevel: form.get("reorderLevel"),
        openingQuantity: form.get("openingQuantity"),
        notes: text(form, "notes"),
      })}
      wide
    >
      {(state) => <ItemFields state={state} />}
    </WarehouseDialog>
  );
}

export function EditItemButton({ item }: { item: ItemDefaults }) {
  const { d } = useLanguage();
  const copy = d.admin.warehouse;

  return (
    <WarehouseDialog
      trigger={
        <Button variant="outline" size="sm">
          <Pencil className="size-3.5" aria-hidden="true" />
          {copy.editItem}
        </Button>
      }
      title={`${copy.editItem} — ${item.sku}`}
      description={item.name}
      endpoint={`/api/admin/warehouse/items/${item.id}`}
      method="PATCH"
      submitLabel={copy.editItem}
      buildBody={(form) => ({
        name: form.get("name"),
        nameRw: text(form, "nameRw"),
        category: form.get("category"),
        unit: form.get("unit"),
        unitCost: form.get("unitCost"),
        unitPrice: form.get("unitPrice"),
        reorderLevel: form.get("reorderLevel"),
        notes: text(form, "notes"),
        isActive: form.get("isActive") === "on",
      })}
      wide
    >
      {(state) => (
        <>
          <ItemFields state={state} defaults={item} />
          <label className="flex items-center gap-2.5 text-sm font-medium text-ink">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={item.isActive}
              className="size-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            {item.isActive ? d.status.ACTIVE : copy.restoreItem}
          </label>
        </>
      )}
    </WarehouseDialog>
  );
}

// ---------------------------------------------------------------------------
// Stock movements
// ---------------------------------------------------------------------------

export function ReceiveStockButton({ item }: { item: ItemDefaults }) {
  const { d } = useLanguage();
  const copy = d.admin.warehouse;

  return (
    <WarehouseDialog
      trigger={
        <Button variant="outline" size="sm">
          <ArrowDownToLine className="size-3.5" aria-hidden="true" />
          {copy.receiveStock}
        </Button>
      }
      title={`${copy.receiveStock} — ${item.name}`}
      description={copy.receiveIntro}
      endpoint={`/api/admin/warehouse/items/${item.id}/receive`}
      submitLabel={copy.receiveStock}
      buildBody={(form) => ({
        quantity: form.get("quantity"),
        unitCost: form.get("unitCost"),
        supplierName: text(form, "supplierName"),
        deliveryNoteRef: text(form, "deliveryNoteRef"),
        note: text(form, "note"),
        occurredAt: form.get("occurredAt"),
      })}
    >
      {(state) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="quantity"
            label={`${copy.quantity} (${item.unit})`}
            error={state.fieldErrors.quantity}
            required
          >
            {(props) => (
              <Input {...props} name="quantity" inputMode="decimal" required autoFocus />
            )}
          </Field>

          <Field
            id="unitCost"
            label={copy.deliveryCost}
            hint={copy.deliveryCostHint}
            error={state.fieldErrors.unitCost}
          >
            {(props) => <Input {...props} name="unitCost" inputMode="decimal" />}
          </Field>

          <Field id="supplierName" label={copy.supplier} error={state.fieldErrors.supplierName}>
            {(props) => <Input {...props} name="supplierName" />}
          </Field>

          <Field
            id="deliveryNoteRef"
            label={copy.deliveryNote}
            error={state.fieldErrors.deliveryNoteRef}
          >
            {(props) => <Input {...props} name="deliveryNoteRef" />}
          </Field>

          <Field id="occurredAt" label={copy.movementDate} error={state.fieldErrors.occurredAt}>
            {(props) => <Input {...props} name="occurredAt" type="date" />}
          </Field>

          <Field id="note" label={copy.notes} error={state.fieldErrors.note} className="sm:col-span-2">
            {(props) => <Textarea {...props} name="note" rows={2} />}
          </Field>
        </div>
      )}
    </WarehouseDialog>
  );
}

export function AdjustStockButton({ item }: { item: ItemDefaults }) {
  const { d } = useLanguage();
  const copy = d.admin.warehouse;

  return (
    <WarehouseDialog
      trigger={
        <Button variant="outline" size="sm">
          <Scale className="size-3.5" aria-hidden="true" />
          {copy.adjustStock}
        </Button>
      }
      title={`${copy.adjustStock} — ${item.name}`}
      description={copy.adjustIntro}
      endpoint={`/api/admin/warehouse/items/${item.id}/adjust`}
      submitLabel={copy.adjustStock}
      buildBody={(form) => ({
        countedQuantity: form.get("countedQuantity"),
        reason: form.get("reason"),
        occurredAt: form.get("occurredAt"),
      })}
    >
      {(state) => (
        <div className="space-y-4">
          <p className="rounded-xl border border-border bg-background/50 px-4 py-3 text-sm text-ink-muted">
            {copy.bookQuantity}:{" "}
            <strong className="text-ink">
              {formatQuantity(item.quantityOnHand, item.unit)}
            </strong>
          </p>

          <Field
            id="countedQuantity"
            label={`${copy.countedQuantity} (${item.unit})`}
            hint={copy.countedQuantityHint}
            error={state.fieldErrors.countedQuantity}
            required
          >
            {(props) => (
              <Input
                {...props}
                name="countedQuantity"
                inputMode="decimal"
                required
                autoFocus
              />
            )}
          </Field>

          <Field
            id="reason"
            label={copy.reason}
            hint={copy.reasonHint}
            error={state.fieldErrors.reason}
            required
          >
            {(props) => <Textarea {...props} name="reason" rows={3} required minLength={10} />}
          </Field>

          <Field id="occurredAt" label={copy.movementDate} error={state.fieldErrors.occurredAt}>
            {(props) => <Input {...props} name="occurredAt" type="date" />}
          </Field>
        </div>
      )}
    </WarehouseDialog>
  );
}

export function WriteOffButton({ item }: { item: ItemDefaults }) {
  const { d } = useLanguage();
  const copy = d.admin.warehouse;

  return (
    <WarehouseDialog
      trigger={
        <Button variant="outline" size="sm">
          <Trash2 className="size-3.5" aria-hidden="true" />
          {copy.writeOff}
        </Button>
      }
      title={`${copy.writeOff} — ${item.name}`}
      description={copy.writeOffIntro}
      endpoint={`/api/admin/warehouse/items/${item.id}/write-off`}
      submitLabel={copy.writeOff}
      tone="danger"
      buildBody={(form) => ({
        quantity: form.get("quantity"),
        reason: form.get("reason"),
        occurredAt: form.get("occurredAt"),
      })}
    >
      {(state) => (
        <div className="space-y-4">
          <Field
            id="quantity"
            label={`${copy.quantity} (${item.unit})`}
            error={state.fieldErrors.quantity}
            required
          >
            {(props) => (
              <Input {...props} name="quantity" inputMode="decimal" required autoFocus />
            )}
          </Field>

          <Field
            id="reason"
            label={copy.reason}
            hint={copy.reasonHint}
            error={state.fieldErrors.reason}
            required
          >
            {(props) => <Textarea {...props} name="reason" rows={3} required minLength={10} />}
          </Field>

          <Field id="occurredAt" label={copy.movementDate} error={state.fieldErrors.occurredAt}>
            {(props) => <Input {...props} name="occurredAt" type="date" />}
          </Field>
        </div>
      )}
    </WarehouseDialog>
  );
}

// ---------------------------------------------------------------------------
// Issuing to a member
// ---------------------------------------------------------------------------

/**
 * The issue form.
 *
 * Lines are held in component state rather than as a growing set of named
 * inputs, because the total has to be shown as the officer types — an issue
 * whose value only appears after submission is one nobody checks before
 * handing over the goods.
 */
export function IssueGoodsButton({
  items,
  members,
  loans,
}: {
  items: ItemOption[];
  members: MemberOption[];
  loans: LoanOption[];
}) {
  const { d } = useLanguage();
  const copy = d.admin.warehouse;

  const [lines, setLines] = useState([{ key: 0, itemId: "", quantity: "", price: "" }]);
  const [nextKey, setNextKey] = useState(1);
  const [memberId, setMemberId] = useState("");
  const [terms, setTerms] = useState<(typeof TERMS)[number]>("PURCHASE");

  const memberLoans = loans.filter((loan) => loan.memberId === memberId);

  const total = lines.reduce((sum, line) => {
    const item = items.find((candidate) => candidate.id === line.itemId);
    if (!item) return sum;
    const price = Number(line.price || item.unitPrice);
    const quantity = Number(line.quantity || 0);
    if (!Number.isFinite(price) || !Number.isFinite(quantity)) return sum;
    return sum + price * quantity;
  }, 0);

  return (
    <WarehouseDialog
      trigger={
        <Button size="sm">
          <Plus className="size-3.5" aria-hidden="true" />
          {copy.issueGoods}
        </Button>
      }
      title={copy.issueGoods}
      description={copy.issueIntro}
      endpoint="/api/admin/warehouse/issuances"
      submitLabel={copy.issueGoods}
      wide
      buildBody={(form) => ({
        memberId: form.get("memberId"),
        terms: form.get("terms"),
        loanId: text(form, "loanId"),
        dueBackAt: form.get("dueBackAt"),
        note: text(form, "note"),
        issuedAt: form.get("issuedAt"),
        lines: lines
          .filter((line) => line.itemId && line.quantity)
          .map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            unitValue: line.price || undefined,
          })),
      })}
    >
      {(state) => (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="memberId"
              label={copy.member}
              hint={copy.memberHint}
              error={state.fieldErrors.memberId}
              required
            >
              {(props) => (
                <NativeSelect
                  {...props}
                  name="memberId"
                  value={memberId}
                  onChange={(event) => setMemberId(event.target.value)}
                  required
                >
                  <option value="">—</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} · {member.memberNumber}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            <Field
              id="terms"
              label={copy.terms}
              hint={copy.termsHint}
              error={state.fieldErrors.terms}
              required
            >
              {(props) => (
                <NativeSelect
                  {...props}
                  name="terms"
                  value={terms}
                  onChange={(event) =>
                    setTerms(event.target.value as (typeof TERMS)[number])
                  }
                >
                  {TERMS.map((value) => (
                    <option key={value} value={value}>
                      {statusLabel(value, d.status)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            {/* Only shown for the terms that need it — the schema requires a
                loan for AGAINST_LOAN and a date for LOAN_OUT, and a field that
                is only sometimes mandatory should only sometimes be there. */}
            {terms === "AGAINST_LOAN" && (
              <Field
                id="loanId"
                label={copy.againstLoanLabel}
                error={state.fieldErrors.loanId}
                required
              >
                {(props) => (
                  <NativeSelect {...props} name="loanId" required>
                    <option value="">{copy.againstLoanNone}</option>
                    {memberLoans.map((loan) => (
                      <option key={loan.id} value={loan.id}>
                        {loan.reference}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            )}

            {terms === "LOAN_OUT" && (
              <Field
                id="dueBackAt"
                label={copy.dueBack}
                hint={copy.dueBackHint}
                error={state.fieldErrors.dueBackAt}
                required
              >
                {(props) => <Input {...props} name="dueBackAt" type="date" required />}
              </Field>
            )}

            <Field id="issuedAt" label={copy.issuedOn} error={state.fieldErrors.issuedAt}>
              {(props) => <Input {...props} name="issuedAt" type="date" />}
            </Field>
          </div>

          <div className="space-y-3 rounded-xl border border-border p-4">
            {state.fieldErrors.lines && (
              <Alert variant="error">{state.fieldErrors.lines.join(" ")}</Alert>
            )}

            {lines.map((line, index) => {
              const item = items.find((candidate) => candidate.id === line.itemId);
              return (
                <div key={line.key} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <NativeSelect
                    aria-label={copy.chooseItem}
                    value={line.itemId}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((candidate, position) =>
                          position === index
                            ? { ...candidate, itemId: event.target.value }
                            : candidate
                        )
                      )
                    }
                  >
                    <option value="">{copy.chooseItem}</option>
                    {items.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name} ({formatQuantity(option.quantityOnHand, option.unit)})
                      </option>
                    ))}
                  </NativeSelect>

                  <Input
                    aria-label={copy.lineQuantity}
                    placeholder={item ? item.unit : copy.lineQuantity}
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((candidate, position) =>
                          position === index
                            ? { ...candidate, quantity: event.target.value }
                            : candidate
                        )
                      )
                    }
                  />

                  <Input
                    aria-label={copy.linePrice}
                    placeholder={item?.unitPrice ?? copy.linePrice}
                    inputMode="decimal"
                    value={line.price}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((candidate, position) =>
                          position === index
                            ? { ...candidate, price: event.target.value }
                            : candidate
                        )
                      )
                    }
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={copy.removeLine}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((_, position) => position !== index)
                      )
                    }
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              );
            })}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setLines((current) => [
                    ...current,
                    { key: nextKey, itemId: "", quantity: "", price: "" },
                  ]);
                  setNextKey((key) => key + 1);
                }}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                {copy.addLine}
              </Button>

              <p className="text-sm font-semibold text-ink">
                {copy.issueTotal}:{" "}
                <span className="tabular-nums">
                  {terms === "FREE_ISSUE" ? formatMoney(0) : formatMoney(total.toFixed(2))}
                </span>
              </p>
            </div>
          </div>

          <Field id="note" label={copy.notes} error={state.fieldErrors.note}>
            {(props) => <Textarea {...props} name="note" rows={2} />}
          </Field>
        </div>
      )}
    </WarehouseDialog>
  );
}

export function RecordReturnButton({ issuance }: { issuance: IssuanceSummary }) {
  const { d } = useLanguage();
  const copy = d.admin.warehouse;

  const [quantities, setQuantities] = useState<Record<string, string>>({});

  return (
    <WarehouseDialog
      trigger={
        <Button variant="outline" size="sm">
          <Undo2 className="size-3.5" aria-hidden="true" />
          {copy.recordReturn}
        </Button>
      }
      title={`${copy.recordReturn} — ${issuance.reference}`}
      description={copy.returnIntro}
      endpoint={`/api/admin/warehouse/issuances/${issuance.id}/return`}
      submitLabel={copy.recordReturn}
      buildBody={(form) => ({
        lines: issuance.lines.map((line) => ({
          lineId: line.id,
          quantity: quantities[line.id] || "0",
        })),
        note: text(form, "note"),
        occurredAt: form.get("occurredAt"),
      })}
    >
      {(state) => (
        <div className="space-y-4">
          {state.fieldErrors.lines && (
            <Alert variant="error">{state.fieldErrors.lines.join(" ")}</Alert>
          )}

          <ul className="space-y-3">
            {issuance.lines.map((line) => (
              <li
                key={line.id}
                className="grid gap-3 sm:grid-cols-[2fr_1fr] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{line.itemName}</p>
                  <p className="text-xs text-ink-muted">
                    {copy.stillOut}:{" "}
                    {formatQuantity(line.quantityOutstanding, line.unit)}
                  </p>
                </div>
                <Input
                  aria-label={`${copy.returnQuantity} — ${line.itemName}`}
                  inputMode="decimal"
                  placeholder="0"
                  value={quantities[line.id] ?? ""}
                  onChange={(event) =>
                    setQuantities((current) => ({
                      ...current,
                      [line.id]: event.target.value,
                    }))
                  }
                />
              </li>
            ))}
          </ul>

          <Field id="occurredAt" label={copy.movementDate} error={state.fieldErrors.occurredAt}>
            {(props) => <Input {...props} name="occurredAt" type="date" />}
          </Field>

          <Field id="note" label={copy.notes} error={state.fieldErrors.note}>
            {(props) => <Textarea {...props} name="note" rows={2} />}
          </Field>
        </div>
      )}
    </WarehouseDialog>
  );
}

export function SettleIssuanceButton({ issuance }: { issuance: IssuanceSummary }) {
  const { d } = useLanguage();
  const copy = d.admin.warehouse;

  return (
    <WarehouseDialog
      trigger={
        <Button variant="outline" size="sm">
          <Wallet className="size-3.5" aria-hidden="true" />
          {copy.settle}
        </Button>
      }
      title={`${copy.settle} — ${issuance.reference}`}
      description={copy.settleIntro}
      endpoint={`/api/admin/warehouse/issuances/${issuance.id}/settle`}
      submitLabel={copy.settle}
      buildBody={(form) => ({
        amount: form.get("amount"),
        fromSavings: form.get("fromSavings") === "on",
        note: text(form, "note"),
      })}
    >
      {(state) => (
        <div className="space-y-4">
          <p className="rounded-xl border border-border bg-background/50 px-4 py-3 text-sm text-ink-muted">
            {copy.issueOwed}:{" "}
            <strong className="text-ink">
              {formatMoney(issuance.amountOwed, { currency: issuance.currency })}
            </strong>
          </p>

          <Field
            id="amount"
            label={copy.settleAmount}
            error={state.fieldErrors.amount}
            required
          >
            {(props) => (
              <Input
                {...props}
                name="amount"
                inputMode="decimal"
                defaultValue={issuance.amountOwed}
                required
                autoFocus
              />
            )}
          </Field>

          <label className="flex items-start gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              name="fromSavings"
              className="mt-0.5 size-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <span>
              <span className="font-medium">{copy.settleFromSavings}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                {copy.settleFromSavingsHint}
              </span>
            </span>
          </label>

          <Field id="note" label={copy.notes} error={state.fieldErrors.note}>
            {(props) => <Textarea {...props} name="note" rows={2} />}
          </Field>
        </div>
      )}
    </WarehouseDialog>
  );
}

/**
 * Cancelling an issue. A ConfirmDialog rather than a form, because the only
 * input is the reason and the act is destructive enough to deserve the
 * confirmation shell every other reversal on the platform uses.
 */
export function CancelIssuanceButton({ issuance }: { issuance: IssuanceSummary }) {
  const router = useRouter();
  const { d } = useLanguage();
  const copy = d.admin.warehouse;

  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5" aria-hidden="true" />
        {copy.cancelIssue}
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`${copy.cancelIssue} — ${issuance.reference}`}
        description={copy.cancelIntro}
        confirmLabel={copy.cancelIssue}
        tone="danger"
        requireReason
        reasonLabel={copy.reason}
        // Matches the 10-character minimum the endpoint enforces. A dialog that
        // accepted less would let the officer write it, confirm, and receive a
        // validation failure with no idea which field was wrong.
        reasonMinLength={10}
        onConfirm={async (reason) => {
          const response = await fetch(
            `/api/admin/warehouse/issuances/${issuance.id}/cancel`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason }),
            }
          );
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.error?.message ?? d.common.serverUnreachable);
          }
          router.refresh();
        }}
      />
    </>
  );
}
