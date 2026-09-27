import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

export async function seed(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const productDefinitions = [
      { sku: "COFFEE-001", name: "Coffee", pricePence: 500 },
      { sku: "TEA-001", name: "Tea", pricePence: 300 },
      { sku: "BISCUITS-001", name: "Biscuits", pricePence: 200 },
      { sku: "MILK-001", name: "Milk", pricePence: 155 },
    ];

    const products = new Map<string, { id: string }>();

    for (const product of productDefinitions) {
      const storedProduct = await tx.product.upsert({
        where: { sku: product.sku },
        update: {},
        create: product,
        select: { id: true },
      });

      products.set(product.sku, storedProduct);
    }

    const threeForTwo = await tx.promotion.upsert({
      where: { code: "THREE_FOR_TWO" },
      update: {},
      create: {
        code: "THREE_FOR_TWO",
        name: "Buy three qualifying items, pay for two",
        type: "BUY_THREE_PAY_TWO",
        priority: 10,
      },
      select: { id: true },
    });

    for (const sku of ["COFFEE-001", "TEA-001", "BISCUITS-001"]) {
      const product = products.get(sku);

      if (!product) {
        throw new Error(`Seed product ${sku} was not created.`);
      }

      await tx.promotionProduct.upsert({
        where: {
          promotionId_productId: {
            promotionId: threeForTwo.id,
            productId: product.id,
          },
        },
        update: {},
        create: {
          promotionId: threeForTwo.id,
          productId: product.id,
        },
      });
    }

    const tenPercentOff = await tx.promotion.upsert({
      where: { code: "TEN_PERCENT_OFF" },
      update: {},
      create: {
        code: "TEN_PERCENT_OFF",
        name: "10% off the remaining basket",
        type: "PERCENTAGE_OFF",
        priority: 20,
        percentageOff: 10,
      },
      select: { id: true },
    });

    await tx.coupon.upsert({
      where: { code: "SAVE10" },
      update: {},
      create: {
        code: "SAVE10",
        promotionId: tenPercentOff.id,
      },
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma = new PrismaClient();

  try {
    await seed(prisma);
    console.log("Sample catalogue and promotions are ready.");
  } finally {
    await prisma.$disconnect();
  }
}