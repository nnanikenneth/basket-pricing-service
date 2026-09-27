import { Type, type Static } from "@sinclair/typebox";
import { LIMITS } from "../../../shared/constants/pricing-limits.js";
import { priceBasketRequestExample } from "./examples/price-basket.request.example.js";

/**
 * Runtime schema for basket-pricing requests.
 *
 * Enforces the HTTP-level structure and basic field constraints before the request
 * reaches the pricing service. Basket-wide limits and duplicate-line handling
 * are applied later during normalisation.
 */
export const priceBasketRequestSchema = Type.Object(
  {
    items: Type.Array(
      Type.Object(
        {
          sku: Type.String({ pattern: "^[A-Z0-9_-]{1,64}$" }),
          quantity: Type.Integer({ minimum: 1, maximum: LIMITS.units }),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: LIMITS.lines },
    ),
    couponCode: Type.Optional(
      Type.String({ pattern: "^[A-Z0-9_-]{1,32}$" }),
    ),
  },
  {
    additionalProperties: false,
    examples: [priceBasketRequestExample],
  },
);

/**
 * TypeScript request type derived from the runtime validation schema.
 */
export type PriceBasketRequest = Static<typeof priceBasketRequestSchema>;