import { LIMITS } from "../../../shared/constants/pricing-limits.js";
import { ApplicationError } from "../../../shared/errors/application-error.js";
import type { BasketRequest } from "../types/basket.js";

/**
 * Normalises a basket into a representation before pricing.
 *
 * Validates basket-level quantity limits, merges duplicate SKU lines,
 * and orders the resulting lines by SKU.
 *
 * @param request Basket request to validate and normalise.
 * @returns A normalised basket suitable for pricing.
 * @throws ApplicationError When basket size or quantities are invalid.
 */
export function normalizeBasket(request: BasketRequest): BasketRequest {
  if (request.items.length === 0 || request.items.length > LIMITS.lines) {
    throw new ApplicationError(
      "INVALID_REQUEST",
      `Basket must contain between 1 and ${LIMITS.lines} lines.`,
    );
  }

  const quantities = new Map<string, number>();
  let totalUnits = 0;

  for (const { sku, quantity } of request.items) {
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new ApplicationError(
        "INVALID_REQUEST",
        "Quantities must be positive integers.",
      );
    }

    if (quantity > LIMITS.units - totalUnits) {
      throw new ApplicationError(
        "INVALID_REQUEST",
        `Basket cannot exceed ${LIMITS.units} units.`,
      );
    }

    totalUnits += quantity;
    quantities.set(sku, (quantities.get(sku) ?? 0) + quantity);
  }

  const items = [...quantities]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([sku, quantity]) => ({ sku, quantity }));

  return {
    items,
    ...(request.couponCode === undefined
      ? {}
      : { couponCode: request.couponCode }),
  };
}