import { invariant } from "../../../shared/errors/application-error.js";
import { money, sumMoney } from "../../../shared/money/money.js";
import type { BasketUnit } from "../types/basket.js";
import type { Promotion, PromotionRegistry } from "../types/promotion.js";
import type { AppliedDiscount } from "../types/pricing-result.js";

/**
 * Applies promotions to priced basket units in a deterministic order.
 *
 * Item-level promotions run before basket-level promotions. Within each phase,
 * lower priority values run first, with promotion code used as a tie-breaker.
 *
 * Item-level promotions may consume units so later item promotions cannot
 * reuse them. Basket-level promotions operate on the remaining basket value
 * and must not consume individual units.
 *
 * The engine validates generic promotion invariants while leaving
 * promotion-specific calculation and discount metadata to registered rules.
 *
 * @param units Individual priced basket units available for promotion evaluation.
 * @param promotions Promotions that are relevant to the current basket.
 * @param registry Registered rules used to evaluate each promotion type.
 * @returns Applied discounts in the order in which the promotions were evaluated.
 */
export function applyPromotions(
  units: readonly BasketUnit[],
  promotions: readonly Promotion[],
  registry: PromotionRegistry,
): AppliedDiscount[] {
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));

  invariant(unitsById.size === units.length, "Duplicate unit ID.");

  invariant(
    new Set(promotions.map((offer) => offer.code)).size === promotions.length,
    "Duplicate promotion code.",
  );

  for (const offer of promotions) {
    invariant(
      Object.hasOwn(registry, offer.type),
      "Unsupported promotion type.",
    );

    invariant(
      Number.isSafeInteger(offer.priority),
      "Invalid promotion priority.",
    );
  }

  const phase = (offer: Promotion) =>
    registry[offer.type].phase === "item" ? 0 : 1;

  const ordered = [...promotions].sort(
    (a, b) =>
      phase(a) - phase(b) ||
      a.priority - b.priority ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );

  const consumed = new Set<string>();
  const discounts: AppliedDiscount[] = [];

  let remainingPence = sumMoney(
    units.map((unit) => unit.pricePence),
  );

  for (const offer of ordered) {
    const rule = registry[offer.type];

    const adjustment = rule.apply(offer, {
      availableUnits: units.filter(
        (unit) => !consumed.has(unit.id),
      ),
      remainingPence,
    });

    if (!adjustment) {
      continue;
    }

    const {
      savingPence,
      consumedUnitIds,
      freeUnitIds,
      breakdown,
    } = adjustment;

    money(savingPence);

    invariant(
      savingPence <= remainingPence,
      "Discount exceeds remaining total.",
    );

    invariant(
      new Set(consumedUnitIds).size === consumedUnitIds.length,
      "Duplicate consumed unit in discount.",
    );

    invariant(
      new Set(freeUnitIds).size === freeUnitIds.length,
      "Duplicate free unit in discount.",
    );

    for (const id of consumedUnitIds) {
      const unit = unitsById.get(id);

      invariant(
        unit && !consumed.has(id),
        "Unknown or reused unit.",
      );
    }

    for (const id of freeUnitIds) {
      const unit = unitsById.get(id);

      invariant(
        unit && consumedUnitIds.includes(id),
        "Invalid free unit.",
      );
    }

    if (rule.phase === "basket") {
      invariant(
        consumedUnitIds.length === 0,
        "Basket offers cannot consume units.",
      );
    }

    if (freeUnitIds.length > 0) {
      invariant(
        sumMoney(
          freeUnitIds.map(
            (id) => unitsById.get(id)!.pricePence,
          ),
        ) === savingPence,
        "Free-item saving does not match the discount.",
      );
    }

    for (const id of consumedUnitIds) {
      consumed.add(id);
    }

    if (savingPence > 0) {
      discounts.push({
        ...breakdown,
        promotionCode: offer.code,
        description: offer.name,
        savingPence,
      });
    }

    remainingPence = money(
      remainingPence - savingPence,
    );
  }

  return discounts;
}