import type { BasketUnit } from "./basket.js";
import type { AppliedDiscount } from "./pricing-result.js";

interface BasePromotion {
  readonly code: string;
  readonly name: string;
  readonly priority: number;
}

export interface MultiBuyPromotion extends BasePromotion {
  readonly type: "BUY_THREE_PAY_TWO";
  readonly eligibleSkus: readonly string[];
}

export interface PercentagePromotion extends BasePromotion {
  readonly type: "PERCENTAGE_OFF";
  readonly percentageOff: number;
  readonly couponCode: string;
}

export type Promotion = MultiBuyPromotion | PercentagePromotion;

/**
 * Runtime data made available to a promotion rule.
 *
 * Item-level rules receive only units that have not already been consumed by
 * an earlier item promotion. Basket-level rules also use the remaining basket
 * value after previously applied savings.
 */
export interface PromotionContext {
  readonly availableUnits: readonly BasketUnit[];
  readonly remainingPence: number;
}

/**
 * Result returned by a promotion rule when it applies.
 *
 * `consumedUnitIds` prevents item-level promotions from reusing units.
 * `freeUnitIds` identifies units contributing to free-item discounts.
 * `breakdown` contains promotion-specific response metadata while the engine
 * adds the common promotion code, description, and saving.
 */
export interface PromotionAdjustment {
  readonly savingPence: number;
  readonly consumedUnitIds: readonly string[];
  readonly freeUnitIds: readonly string[];

  readonly breakdown: Omit<
    AppliedDiscount,
    "promotionCode" | "description" | "savingPence"
  >;
}

/**
 * Contract implemented by each promotion type.
 *
 * Rules own promotion-specific calculation logic, while the promotion engine
 * owns ordering, orchestration, unit-consumption tracking, and validation.
 */
export interface PromotionRule {
  readonly phase: "item" | "basket";

  apply(
    promotion: Promotion,
    context: PromotionContext,
  ): PromotionAdjustment | null;
}

/**
 * Maps every supported promotion type to the rule that evaluates it.
 */
export type PromotionRegistry = Readonly<
  Record<Promotion["type"], PromotionRule>
>;