import { invariant } from "../../../../shared/errors/application-error.js";
import { percentageSaving } from "../../../../shared/money/money.js";
import type { PromotionRule } from "../../types/promotion.js";

/**
 * Applies a basket-level percentage discount to the remaining basket value.
 *
 * The saving is calculated once against the current remaining total using the
 * shared money helper. This rule does not consume individual basket units.
 *
 * The returned breakdown records both the coupon code and the basket value
 * used as the percentage-discount basis.
 */
export const percentageOffRule: PromotionRule = {
  phase: "basket",

  apply(promotion, context) {
    invariant(
      promotion.type === "PERCENTAGE_OFF",
      "Expected a percentage-off promotion.",
    );

    const savingPence = percentageSaving(
      context.remainingPence,
      promotion.percentageOff,
    );

    if (savingPence === 0) {
      return null;
    }

    return {
      savingPence,
      consumedUnitIds: [],
      freeUnitIds: [],

      breakdown: {
        freeItems: [],
        couponCode: promotion.couponCode,
        basisPence: context.remainingPence,
      },
    };
  },
};