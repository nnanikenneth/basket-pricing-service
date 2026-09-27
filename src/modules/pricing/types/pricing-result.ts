import type { CURRENCY } from "../../../shared/constants/pricing-limits.js";

export interface PricedLine {
  sku: string;
  name: string;
  quantity: number;
  unitPricePence: number;
  lineSubtotalPence: number;
}

/**
 * Describes one promotion that contributed to the basket saving.
 */
export interface AppliedDiscount {
  promotionCode: string;
  description: string;
  savingPence: number;
  freeItems: { sku: string; quantity: number }[];
  couponCode?: string;
  basisPence?: number;
}

/**
 * Complete pricing result returned by the basket calculator.
 *
 * Includes the undiscounted basket value, each applied promotion, aggregate
 * savings, and the final amount payable.
 */
export interface PricingResult {
  currency: typeof CURRENCY;
  items: PricedLine[];
  subtotalPence: number;
  discounts: AppliedDiscount[];
  totalSavingsPence: number;
  totalPence: number;
}