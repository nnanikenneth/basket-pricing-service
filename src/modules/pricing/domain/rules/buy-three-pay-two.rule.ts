import { invariant } from "../../../../shared/errors/application-error.js";
import { sumMoney } from "../../../../shared/money/money.js";
import type { PromotionRule } from "../../types/promotion.js";

/**
 * Applies the buy-three-pay-two item promotion.
 *
 * Qualifying units are ordered by descending price and grouped in threes.
 * The cheapest unit in each complete group is free.
 *
 * All units participating in a complete group are consumed so that later
 * item-level promotions cannot reuse them. Units outside complete groups
 * remain available to subsequent promotions.
 */
export const buyThreePayTwoRule: PromotionRule = {
  phase: "item",

  apply(promotion, context) {
    invariant(
      promotion.type === "BUY_THREE_PAY_TWO",
      "Expected a buy-three-pay-two promotion.",
    );

    const eligibleSkus = new Set(promotion.eligibleSkus);

    const units = context.availableUnits
      .filter((unit) => eligibleSkus.has(unit.sku))
      .sort(
        (a, b) =>
          b.pricePence - a.pricePence ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );

    const qualifyingCount = Math.floor(units.length / 3) * 3;

    if (qualifyingCount === 0) {
      return null;
    }

    const participatingUnits = units.slice(0, qualifyingCount);

    const freeUnits = participatingUnits.filter(
      (_, index) => index % 3 === 2,
    );

    const freeItemCounts = new Map<string, number>();

    for (const unit of freeUnits) {
      freeItemCounts.set(
        unit.sku,
        (freeItemCounts.get(unit.sku) ?? 0) + 1,
      );
    }

    return {
      savingPence: sumMoney(freeUnits.map((unit) => unit.pricePence)),
      consumedUnitIds: participatingUnits.map((unit) => unit.id),
      freeUnitIds: freeUnits.map((unit) => unit.id),
      breakdown: {
        freeItems: [...freeItemCounts].map(([sku, quantity]) => ({
          sku,
          quantity,
        })),
      },
    };
  },
};