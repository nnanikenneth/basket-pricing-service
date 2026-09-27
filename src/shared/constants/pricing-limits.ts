/**
 * Application limits used to bound basket size and monetary values.
 */
export const LIMITS = {
  lines: 100,
  units: 1_000,
  unitPricePence: 1_000_000,
} as const;

/**
 * Currency used for all basket pricing calculations.
 */
export const CURRENCY = "GBP" as const;