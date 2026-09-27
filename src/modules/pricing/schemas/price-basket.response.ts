import { Type } from "@sinclair/typebox";
import { CURRENCY } from "../../../shared/constants/pricing-limits.js";
import { priceBasketResponseExample } from "./examples/price-basket.response.example.js";

const pence = Type.Integer({ minimum: 0 });

export const priceBasketResponseSchema = Type.Object(
  {
    currency: Type.Literal(CURRENCY),
    items: Type.Array(
      Type.Object({
        sku: Type.String(),
        name: Type.String(),
        quantity: Type.Integer({ minimum: 1 }),
        unitPricePence: pence,
        lineSubtotalPence: pence,
      }),
    ),
    subtotalPence: pence,
    discounts: Type.Array(
      Type.Object({
        promotionCode: Type.String(),
        description: Type.String(),
        savingPence: pence,
        freeItems: Type.Array(
          Type.Object({
            sku: Type.String(),
            quantity: Type.Integer({ minimum: 1 }),
          }),
        ),
        couponCode: Type.Optional(Type.String()),
        basisPence: Type.Optional(pence),
      }),
    ),
    totalSavingsPence: pence,
    totalPence: pence,
  },
  {
    examples: [priceBasketResponseExample],
  },
);

export const errorResponseSchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    requestId: Type.String(),
    details: Type.Optional(Type.Unknown()),
  }),
});