export const priceBasketResponseExample = {
  currency: "GBP",
  items: [
    {
      sku: "BISCUITS-001",
      name: "Biscuits",
      quantity: 1,
      unitPricePence: 200,
      lineSubtotalPence: 200,
    },
    {
      sku: "COFFEE-001",
      name: "Coffee",
      quantity: 1,
      unitPricePence: 500,
      lineSubtotalPence: 500,
    },
    {
      sku: "TEA-001",
      name: "Tea",
      quantity: 1,
      unitPricePence: 300,
      lineSubtotalPence: 300,
    },
  ],
  subtotalPence: 1000,
  discounts: [
    {
      promotionCode: "THREE_FOR_TWO",
      description: "Buy three qualifying items, pay for two",
      savingPence: 200,
      freeItems: [
        {
          sku: "BISCUITS-001",
          quantity: 1,
        },
      ],
    },
    {
      promotionCode: "TEN_PERCENT_OFF",
      description: "10% off the remaining basket",
      savingPence: 80,
      freeItems: [],
      couponCode: "SAVE10",
      basisPence: 800,
    },
  ],
  totalSavingsPence: 280,
  totalPence: 720,
};