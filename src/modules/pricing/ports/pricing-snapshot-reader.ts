import type { Product } from "../types/product.js";
import type { Promotion } from "../types/promotion.js";

/**
 * Immutable pricing data required to calculate a basket.
 *
 * A snapshot contains the product prices and promotions relevant to a single
 * pricing request.
 */
export interface PricingSnapshot {
  readonly products: readonly Product[];
  readonly promotions: readonly Promotion[];
}

/**
 * Abstraction for retrieving the pricing data required by the calculator.
 *
 * Implementations are responsible for loading the requested products and
 * promotions relevant to the supplied SKUs and optional coupon code.
 */
export interface PricingSnapshotReader {
  /**
   * Retrieves the pricing snapshot for a basket calculation.
   *
   * @param skus Product SKUs present in the normalised basket.
   * @param couponCode Optional coupon code supplied with the request.
   * @returns The products and relevant promotions needed for pricing.
   */
  read(
    skus: readonly string[],
    couponCode?: string,
  ): Promise<PricingSnapshot>;
}