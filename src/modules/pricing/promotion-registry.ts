import { buyThreePayTwoRule } from "./domain/rules/buy-three-pay-two.rule.js";
import { percentageOffRule } from "./domain/rules/percentage-off.rule.js";
import type { PromotionRegistry } from "./types/promotion.js";

/**
 * Registry of promotion types and the rules responsible for evaluating them.
 *
 * Adding a new promotion type requires registering its corresponding rule here
 * after extending the promotion type definitions.
 */
export const promotionRegistry: PromotionRegistry = {
  BUY_THREE_PAY_TWO: buyThreePayTwoRule,
  PERCENTAGE_OFF: percentageOffRule,
};