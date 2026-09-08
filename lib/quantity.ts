import { Decimal, type MoneyInput } from "@/lib/money";

/**
 * Stock quantity primitives.
 *
 * Separate from lib/money.ts for one reason: scale. Money is NUMERIC(18,2)
 * because currency is quoted to the cent; stock is NUMERIC(18,3) because
 * fabric is issued in metres and thread by weight, and a warehouse that can
 * only count whole pieces has to round 2.5 metres to two or three — putting a
 * quantity on a member's file that they did not receive, in whichever
 * direction the rounding fell.
 *
 * Everything else follows money.ts exactly, and for the same reasons: decimal
 * arithmetic rather than floats, strings across the JSON boundary, half-up
 * rounding so hand-checked figures agree. This module is likewise
 * runtime-agnostic — it is imported by the admin stock forms as well as by the
 * service, so it must not touch `server-only`, Prisma or the environment.
 */

// Matches the NUMERIC(18,3) columns on warehouse_items and
// warehouse_stock_movements exactly.
export const QUANTITY_SCALE = 3;

export type QuantityInput = MoneyInput;

/**
 * Coerces a value to a Decimal quantity.
 *
 * Unlike `toMoney`, a non-integer `number` is accepted here. Quantities
 * legitimately arrive from a number input as 2.5, and — unlike money — they
 * are not the output of a chain of arithmetic that could already have lost
 * precision. The scale guard below still rejects anything finer than 3dp.
 */
export function toQuantity(value: QuantityInput | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  if (value instanceof Decimal) return value;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Invalid quantity: ${value}`);
    }
    return new Decimal(value);
  }

  const raw = typeof value === "string" ? value : value.toString();
  const normalised = raw.trim().replace(/,/g, "");
  if (normalised === "") return new Decimal(0);

  let decimal: Decimal;
  try {
    decimal = new Decimal(normalised);
  } catch {
    throw new TypeError(`Invalid quantity: ${JSON.stringify(raw)}`);
  }

  if (!decimal.isFinite()) {
    throw new TypeError(`Invalid quantity: ${JSON.stringify(raw)}`);
  }

  return decimal;
}

/** Rounds to the storage scale. Apply before persisting or comparing. */
export function quantizeQuantity(value: QuantityInput): Decimal {
  return toQuantity(value).toDecimalPlaces(QUANTITY_SCALE, Decimal.ROUND_HALF_UP);
}

/** Canonical string form — always exactly three decimal places. */
export function toQuantityString(value: QuantityInput): string {
  return quantizeQuantity(value).toFixed(QUANTITY_SCALE);
}

export function addQuantity(...values: QuantityInput[]): Decimal {
  return quantizeQuantity(
    values.reduce<Decimal>((sum, v) => sum.plus(toQuantity(v)), new Decimal(0))
  );
}

export function subtractQuantity(a: QuantityInput, b: QuantityInput): Decimal {
  return quantizeQuantity(toQuantity(a).minus(toQuantity(b)));
}

export const isPositiveQuantity = (v: QuantityInput) =>
  quantizeQuantity(v).greaterThan(0);
export const isZeroQuantity = (v: QuantityInput) => quantizeQuantity(v).isZero();
export const gtQuantity = (a: QuantityInput, b: QuantityInput) =>
  quantizeQuantity(a).greaterThan(quantizeQuantity(b));
export const gteQuantity = (a: QuantityInput, b: QuantityInput) =>
  quantizeQuantity(a).greaterThanOrEqualTo(quantizeQuantity(b));
export const ltQuantity = (a: QuantityInput, b: QuantityInput) =>
  quantizeQuantity(a).lessThan(quantizeQuantity(b));

/**
 * Display form, e.g. formatQuantity("2.500", "metre") → "2.5 metre".
 *
 * Trailing zeros are dropped because "5.000 piece" reads as a measurement
 * precision the storekeeper never claimed. The stored value keeps its scale.
 */
export function formatQuantity(
  value: QuantityInput | null | undefined,
  unit?: string | null
): string {
  const quantity = quantizeQuantity(value ?? 0);
  const decimals = Math.max(0, quantity.decimalPlaces());

  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(Number(quantity.toFixed(QUANTITY_SCALE)));

  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Parses a quantity from a form. Returns a discriminated result rather than
 * throwing, so the field can render its own message inline.
 */
export function parseQuantityInput(
  input: string,
  options: { allowZero?: boolean; max?: QuantityInput } = {}
): { ok: true; value: Decimal } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, error: "Enter a quantity" };

  let value: Decimal;
  try {
    value = toQuantity(trimmed);
  } catch {
    return { ok: false, error: "Enter a valid quantity" };
  }

  if (value.isNegative()) {
    return { ok: false, error: "Quantity cannot be negative" };
  }
  if (!options.allowZero && value.isZero()) {
    return { ok: false, error: "Quantity must be greater than zero" };
  }
  if (value.decimalPlaces() > QUANTITY_SCALE) {
    return {
      ok: false,
      error: `Quantity cannot have more than ${QUANTITY_SCALE} decimal places`,
    };
  }
  if (options.max !== undefined && gtQuantity(value, options.max)) {
    return {
      ok: false,
      error: `Only ${formatQuantity(options.max)} available`,
    };
  }

  return { ok: true, value };
}
