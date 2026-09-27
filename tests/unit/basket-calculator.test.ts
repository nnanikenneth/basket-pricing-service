import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateBasket as calculateBasketCore } from "../../src/modules/pricing/domain/basket-calculator.js";
import { normalizeBasket } from "../../src/modules/pricing/helpers/normalize-basket.js";
import type { PricingSnapshot } from "../../src/modules/pricing/ports/pricing-snapshot-reader.js";
import type { BasketRequest } from "../../src/modules/pricing/types/basket.js";
import type { PricingResult } from "../../src/modules/pricing/types/pricing-result.js";
import type { Product } from "../../src/modules/pricing/types/product.js";
import type {
  MultiBuyPromotion,
  PercentagePromotion,
} from "../../src/modules/pricing/types/promotion.js";

function calculateBasket(
  request: BasketRequest,
  snapshot: PricingSnapshot,
): PricingResult {
  return calculateBasketCore(normalizeBasket(request), snapshot);
}

const products: Product[] = [
  { sku: "COFFEE-001", name: "Coffee", pricePence: 500 },
  { sku: "TEA-001", name: "Tea", pricePence: 300 },
  { sku: "BISCUITS-001", name: "Biscuits", pricePence: 200 },
  { sku: "MILK-001", name: "Milk", pricePence: 155 },
];

const multiBuy: MultiBuyPromotion = {
  code: "THREE_FOR_TWO",
  name: "Buy three, pay for two",
  type: "BUY_THREE_PAY_TWO",
  priority: 10,
  eligibleSkus: ["COFFEE-001", "TEA-001", "BISCUITS-001"],
};

const coupon: PercentagePromotion = {
  code: "TEN_PERCENT_OFF",
  name: "Save 10%",
  type: "PERCENTAGE_OFF",
  priority: 0,
  percentageOff: 10,
  couponCode: "SAVE10",
};

const mixedBasket = [
  { sku: "COFFEE-001", quantity: 1 },
  { sku: "TEA-001", quantity: 1 },
  { sku: "BISCUITS-001", quantity: 1 },
];

test("returns an exact breakdown when no offers apply", () => {
  const result = calculateBasket(
    { items: [{ sku: "MILK-001", quantity: 2 }] },
    { products, promotions: [] },
  );
  assert.deepEqual(result, {
    currency: "GBP",
    items: [
      {
        sku: "MILK-001",
        name: "Milk",
        quantity: 2,
        unitPricePence: 155,
        lineSubtotalPence: 310,
      },
    ],
    subtotalPence: 310,
    discounts: [],
    totalSavingsPence: 0,
    totalPence: 310,
  });
});

test("makes the cheapest qualifying item free", () => {
  const result = calculateBasket(
    { items: mixedBasket },
    { products, promotions: [multiBuy] },
  );
  assert.equal(result.subtotalPence, 1000);
  assert.equal(result.totalPence, 800);
  assert.deepEqual(result.discounts, [
    {
      promotionCode: multiBuy.code,
      description: multiBuy.name,
      savingPence: 200,
      freeItems: [{ sku: "BISCUITS-001", quantity: 1 }],
    },
  ]);
});

test("groups six qualifying units by descending price", () => {
  const result = calculateBasket(
    {
      items: mixedBasket.map((item) => ({
        ...item,
        quantity: 2,
      })),
    },
    { products, promotions: [multiBuy] },
  );
  // Groups: [500, 500, 300] and [300, 200, 200].
  assert.equal(result.subtotalPence, 2000);
  assert.equal(result.totalSavingsPence, 500);
  assert.equal(result.totalPence, 1500);
  assert.deepEqual(result.discounts[0]?.freeItems, [
    { sku: "TEA-001", quantity: 1 },
    { sku: "BISCUITS-001", quantity: 1 },
  ]);
});

test("discounts only complete groups, including repeated products", () => {
  for (const [quantity, saving] of [
    [1, 0],
    [2, 0],
    [3, 500],
    [4, 500],
    [6, 1000],
  ] as const) {
    const result = calculateBasket(
      {
        items: [
          {
            sku: "COFFEE-001",
            quantity,
          },
        ],
      },
      { products, promotions: [multiBuy] },
    );
    assert.equal(
      result.totalSavingsPence,
      saving,
      `quantity=${quantity}`,
    );
    assert.equal(
      result.totalPence,
      quantity * 500 - saving,
    );
  }
});

test("ineligible items cannot complete a qualifying group", () => {
  const result = calculateBasket(
    {
      items: [
        { sku: "COFFEE-001", quantity: 2 },
        { sku: "MILK-001", quantity: 1 },
      ],
    },
    { products, promotions: [multiBuy] },
  );
  assert.deepEqual(result.discounts, []);
  assert.equal(result.totalPence, 1155);
});

test("applies the coupon after multi-buy even with a lower priority number", () => {
  const result = calculateBasket(
    {
      items: mixedBasket,
      couponCode: "SAVE10",
    },
    {
      products,
      promotions: [coupon, multiBuy],
    },
  );
  assert.equal(result.subtotalPence, 1000);
  assert.equal(result.totalSavingsPence, 280);
  assert.equal(result.totalPence, 720);
  assert.deepEqual(result.discounts[1], {
    promotionCode: coupon.code,
    description: coupon.name,
    savingPence: 80,
    freeItems: [],
    couponCode: "SAVE10",
    basisPence: 800,
  });
});

test("rounds a half-penny coupon saving up once on the basket total", () => {
  const result = calculateBasket(
    {
      items: [
        {
          sku: "MILK-001",
          quantity: 3,
        },
      ],
      couponCode: "SAVE10",
    },
    {
      products,
      promotions: [coupon],
    },
  );
  // 465 * 10% = 46.5p, rounded to 47p (not 16p per unit).
  assert.equal(result.totalSavingsPence, 47);
  assert.equal(result.totalPence, 418);
});

test("merging duplicate lines and reordering inputs does not change the result", () => {
  const expected = calculateBasket(
    {
      items: [
        {
          sku: "COFFEE-001",
          quantity: 3,
        },
      ],
      couponCode: "SAVE10",
    },
    {
      products,
      promotions: [multiBuy, coupon],
    },
  );
  const actual = calculateBasket(
    {
      items: [
        { sku: "COFFEE-001", quantity: 1 },
        { sku: "COFFEE-001", quantity: 2 },
      ],
      couponCode: "SAVE10",
    },
    {
      products: [...products].reverse(),
      promotions: [coupon, multiBuy],
    },
  );
  assert.deepEqual(actual, expected);
});

test("overlapping offers cannot reuse any unit from a consumed group", () => {
  const laterOffer = {
    ...multiBuy,
    code: "LATER_OFFER",
    priority: 20,
  };
  const result = calculateBasket(
    {
      items: [
        {
          sku: "COFFEE-001",
          quantity: 4,
        },
      ],
    },
    {
      products,
      promotions: [laterOffer, multiBuy],
    },
  );
  assert.equal(result.totalSavingsPence, 500);
  assert.equal(result.totalPence, 1500);
  assert.deepEqual(
    result.discounts.map(
      (discount) => discount.promotionCode,
    ),
    [multiBuy.code],
  );
});

test("breaks equal-priority offer ties by promotion code", () => {
  const firstOffer: MultiBuyPromotion = {
    ...multiBuy,
    code: "A_OFFER",
  };
  const secondOffer: MultiBuyPromotion = {
    ...multiBuy,
    code: "B_OFFER",
  };
  for (const promotions of [
    [secondOffer, firstOffer],
    [firstOffer, secondOffer],
  ]) {
    const result = calculateBasket(
      { items: mixedBasket },
      {
        products,
        promotions,
      },
    );
    assert.equal(result.totalSavingsPence, 200);
    assert.equal(result.totalPence, 800);
    assert.deepEqual(
      result.discounts.map(
        (discount) => discount.promotionCode,
      ),
      ["A_OFFER"],
    );
  }
});

test("allows leftover units to qualify for a later offer", () => {
  const coffeeOffer: MultiBuyPromotion = {
    ...multiBuy,
    code: "COFFEE_OFFER",
    priority: 10,
    eligibleSkus: ["COFFEE-001"],
  };
  const mixedOffer: MultiBuyPromotion = {
    ...multiBuy,
    code: "MIXED_OFFER",
    priority: 20,
  };
  const result = calculateBasket(
    {
      items: [
        { sku: "COFFEE-001", quantity: 4 },
        { sku: "TEA-001", quantity: 1 },
        { sku: "BISCUITS-001", quantity: 1 },
      ],
    },
    {
      products,
      promotions: [mixedOffer, coffeeOffer],
    },
  );
  // First offer: three coffees, saving 500p.
  // Second offer: leftover coffee, tea, and biscuits, saving 200p.
  assert.equal(result.subtotalPence, 2500);
  assert.equal(result.totalSavingsPence, 700);
  assert.equal(result.totalPence, 1800);
  assert.deepEqual(result.discounts, [
    {
      promotionCode: coffeeOffer.code,
      description: coffeeOffer.name,
      savingPence: 500,
      freeItems: [
        {
          sku: "COFFEE-001",
          quantity: 1,
        },
      ],
    },
    {
      promotionCode: mixedOffer.code,
      description: mixedOffer.name,
      savingPence: 200,
      freeItems: [
        {
          sku: "BISCUITS-001",
          quantity: 1,
        },
      ],
    },
  ]);
});

test("consumes a qualifying group even when its free item costs zero", () => {
  const catalogue: Product[] = [
    ...products,
    {
      sku: "SAMPLE-001",
      name: "Free sample",
      pricePence: 0,
    },
  ];
  const firstOffer: MultiBuyPromotion = {
    ...multiBuy,
    code: "FIRST_OFFER",
    priority: 10,
    eligibleSkus: ["COFFEE-001", "SAMPLE-001"],
  };
  const laterOffer: MultiBuyPromotion = {
    ...multiBuy,
    code: "LATER_OFFER",
    priority: 20,
    eligibleSkus: ["COFFEE-001", "TEA-001"],
  };
  const result = calculateBasket(
    {
      items: [
        { sku: "COFFEE-001", quantity: 2 },
        { sku: "SAMPLE-001", quantity: 1 },
        { sku: "TEA-001", quantity: 1 },
      ],
    },
    {
      products: catalogue,
      promotions: [laterOffer, firstOffer],
    },
  );
  // The first group consumes both coffees and the zero-priced sample.
  // The later offer cannot reuse those coffees to make the tea free.
  assert.equal(result.subtotalPence, 1300);
  assert.equal(result.totalSavingsPence, 0);
  assert.equal(result.totalPence, 1300);
  assert.deepEqual(result.discounts, []);
});

test("a 100 percent coupon discounts exactly the remaining basket", () => {
  const fullDiscount: PercentagePromotion = {
    ...coupon,
    code: "FULL_DISCOUNT",
    name: "100% off the remaining basket",
    percentageOff: 100,
    couponCode: "FREE100",
  };
  const result = calculateBasket(
    {
      items: mixedBasket,
      couponCode: "FREE100",
    },
    {
      products,
      promotions: [fullDiscount, multiBuy],
    },
  );
  assert.equal(result.subtotalPence, 1000);
  assert.equal(result.totalSavingsPence, 1000);
  assert.equal(result.totalPence, 0);
  assert.deepEqual(result.discounts[1], {
    promotionCode: fullDiscount.code,
    description: fullDiscount.name,
    savingPence: 800,
    freeItems: [],
    couponCode: "FREE100",
    basisPence: 800,
  });
});

test("varied baskets preserve money totals and input-order independence", () => {
  for (const coffeeQuantity of [0, 1, 2, 3, 4, 6]) {
    for (const teaQuantity of [0, 1, 2, 3]) {
      for (const percentageOff of [1, 10, 33, 100]) {
        const basket = [
          {
            sku: "COFFEE-001",
            quantity: coffeeQuantity,
          },
          {
            sku: "TEA-001",
            quantity: teaQuantity,
          },
          {
            sku: "BISCUITS-001",
            quantity: 2,
          },
          {
            sku: "MILK-001",
            quantity: 3,
          },
        ].filter((line) => line.quantity > 0);
        const variedCoupon: PercentagePromotion = {
          ...coupon,
          percentageOff,
        };
        const label =
          `coffee=${coffeeQuantity}, tea=${teaQuantity}, ` +
          `percentage=${percentageOff}`;
        const result = calculateBasket(
          {
            items: basket,
            couponCode: coupon.couponCode,
          },
          {
            products,
            promotions: [multiBuy, variedCoupon],
          },
        );
        const expectedSubtotal =
          coffeeQuantity * 500 +
          teaQuantity * 300 +
          2 * 200 +
          3 * 155;
        assert.equal(
          result.subtotalPence,
          expectedSubtotal,
          label,
        );
        for (const line of result.items) {
          assert.equal(
            line.lineSubtotalPence,
            line.unitPricePence * line.quantity,
            label,
          );
        }
        assert.equal(
          result.items.reduce(
            (sum, line) =>
              sum + line.lineSubtotalPence,
            0,
          ),
          result.subtotalPence,
          label,
        );
        assert.equal(
          result.discounts.reduce(
            (sum, discount) =>
              sum + discount.savingPence,
            0,
          ),
          result.totalSavingsPence,
          label,
        );
        assert.equal(
          result.subtotalPence -
            result.totalSavingsPence,
          result.totalPence,
          label,
        );
        assert.ok(
          result.totalSavingsPence <=
            result.subtotalPence,
          label,
        );
        const amounts = [
          result.subtotalPence,
          result.totalSavingsPence,
          result.totalPence,
          ...result.items.flatMap((line) => [
            line.unitPricePence,
            line.lineSubtotalPence,
          ]),
          ...result.discounts.flatMap((discount) => [
            discount.savingPence,
            ...(discount.basisPence === undefined
              ? []
              : [discount.basisPence]),
          ]),
        ];
        for (const amount of amounts) {
          assert.ok(
            Number.isSafeInteger(amount) &&
              amount >= 0,
            label,
          );
        }
        const reorderedBasket = basket
          .flatMap(({ sku, quantity }) =>
            Array.from(
              { length: quantity },
              () => ({
                sku,
                quantity: 1,
              }),
            ),
          )
          .reverse();
        const reordered = calculateBasket(
          {
            items: reorderedBasket,
            couponCode: coupon.couponCode,
          },
          {
            products: [...products].reverse(),
            promotions: [
              variedCoupon,
              multiBuy,
            ],
          },
        );
        assert.deepEqual(
          reordered,
          result,
          label,
        );
      }
    }
  }
});