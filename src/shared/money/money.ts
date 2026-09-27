import { invariant } from "../errors/application-error.js";

/**
 * Validates and returns a monetary value represented in integer pence.
 *
 * Monetary values must be non-negative safe integers so calculations avoid
 * floating-point precision issues and unsafe integer arithmetic.
 *
 * @param value Monetary amount in pence.
 * @returns The validated monetary value.
 */
export function money(value: number): number {
  invariant(
    Number.isSafeInteger(value) && value >= 0,
    "Money must be a non-negative safe integer in pence.",
  );
  return value;
}

/**
 * Sums monetary values while validating each input and intermediate total.
 *
 * @param values Monetary amounts in pence.
 * @returns The validated total in pence.
 */
export function sumMoney(values: readonly number[]): number {
  return values.reduce((total, value) => money(total + money(value)), 0);
}

/**
 * Calculates a percentage saving against a monetary amount.
 *
 * The percentage is applied once to the supplied amount and rounded to the
 * nearest penny, with half-pennies rounded upwards.
 *
 * @param amount Monetary amount in pence used as the calculation basis.
 * @param percentage Integer percentage from 1 to 100.
 * @returns The rounded saving in pence.
 */
export function percentageSaving(amount: number, percentage: number): number {
  money(amount);
  invariant(
    Number.isInteger(percentage) && percentage >= 1 && percentage <= 100,
    "Percentage must be an integer between 1 and 100.",
  );

  // Round half a penny upwards; validate the intermediate arithmetic too.
  const numerator = money(amount * percentage + 50);
  return Math.floor(numerator / 100);
}