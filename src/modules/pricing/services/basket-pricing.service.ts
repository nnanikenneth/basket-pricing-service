import { calculateBasket } from "../domain/basket-calculator.js";
import { normalizeBasket } from "../helpers/normalize-basket.js";
import type { PricingSnapshotReader } from "../ports/pricing-snapshot-reader.js";
import type { BasketRequest } from "../types/basket.js";
import type { PricingResult } from "../types/pricing-result.js";

/**
 * Coordinates basket pricing from request normalisation through calculation.
 *
 * The service keeps orchestration concerns outside the pricing domain by:
 * - normalising duplicate and reordered basket lines;
 * - loading the relevant product and promotion snapshot;
 * - delegating the actual calculation to the domain calculator.
 */
export class BasketPricingService {
  constructor(private readonly reader: PricingSnapshotReader) {}

  /**
   * Prices a basket using the current product and promotion snapshot.
   *
   * @param request Raw basket request from the HTTP layer.
   * @returns The priced basket including subtotal, applied discounts, and final total.
   */
  async price(request: BasketRequest): Promise<PricingResult> {
    const basket = normalizeBasket(request);
    const skus = basket.items.map((item) => item.sku);
    const snapshot = await this.reader.read(skus, basket.couponCode);

    return calculateBasket(basket, snapshot);
  }
}