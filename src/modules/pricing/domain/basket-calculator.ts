import { CURRENCY, LIMITS } from "../../../shared/constants/pricing-limits.js";
import { invariant } from "../../../shared/errors/application-error.js";
import { money, sumMoney } from "../../../shared/money/money.js";
import type { PricingSnapshot } from "../ports/pricing-snapshot-reader.js";
import { promotionRegistry } from "../promotion-registry.js";
import type { BasketRequest, BasketUnit } from "../types/basket.js";
import type { PricingResult } from "../types/pricing-result.js";
import { applyPromotions } from "./promotion-engine.js";

/**
 * Calculates the final price of an already-normalised basket.
 *
 * Builds priced basket lines and individual units, calculates the subtotal,
 * applies the registered promotions, and assembles the final pricing result.
 *
 * @param basket Normalised basket containing the products and quantities to price.
 * @param snapshot Product prices and promotions relevant to the basket.
 * @returns The complete pricing result, including discounts and final amount payable.
 */
export function calculateBasket(
  basket: BasketRequest,
  snapshot: PricingSnapshot,
): PricingResult {
  const products = new Map(
    snapshot.products.map((product) => [product.sku, product]),
  );

  invariant(
    products.size === snapshot.products.length,
    "Duplicate product SKU.",
  );

  const units: BasketUnit[] = [];

  const items = basket.items.map(({ sku, quantity }) => {
    const product = products.get(sku);

    invariant(product, "Product missing from pricing snapshot.");

    money(product.pricePence);

    invariant(
      product.pricePence <= LIMITS.unitPricePence,
      "Product price exceeds the supported limit.",
    );

    for (let index = 0; index < quantity; index++) {
      units.push({
        id: `${sku}:${String(index).padStart(4, "0")}`,
        sku,
        pricePence: product.pricePence,
      });
    }

    return {
      sku,
      name: product.name,
      quantity,
      unitPricePence: product.pricePence,
      lineSubtotalPence: money(product.pricePence * quantity),
    };
  });

  const subtotalPence = sumMoney(items.map((item) => item.lineSubtotalPence));

  const discounts = applyPromotions(
    units,
    snapshot.promotions,
    promotionRegistry,
  );

  const totalSavingsPence = sumMoney(
    discounts.map((discount) => discount.savingPence),
  );

  return {
    currency: CURRENCY,
    items,
    subtotalPence,
    discounts,
    totalSavingsPence,
    totalPence: money(subtotalPence - totalSavingsPence),
  };
}