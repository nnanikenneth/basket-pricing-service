import type { PrismaClient } from "@prisma/client";
import { LIMITS } from "../../../shared/constants/pricing-limits.js";
import {
  ApplicationError,
  invariant,
} from "../../../shared/errors/application-error.js";
import type {
  PricingSnapshot,
  PricingSnapshotReader,
} from "../ports/pricing-snapshot-reader.js";
import type { Promotion } from "../types/promotion.js";

/**
 * Prisma-backed implementation of the pricing snapshot boundary.
 *
 * Loads the active products and promotions required for a single basket
 * calculation and maps stored database records into pricing-domain types.
 *
 * Stored pricing configuration is validated before it is exposed to the
 * calculator so invalid catalogue or promotion data fails explicitly.
 */
export class PrismaPricingSnapshotReader implements PricingSnapshotReader {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Reads a consistent pricing snapshot for the requested basket.
   *
   * Products and applicable promotions are loaded within one database
   * transaction. Percentage promotions are only included when their
   * associated coupon was supplied and is active.
   *
   * @param skus Product SKUs present in the normalised basket.
   * @param couponCode Optional coupon code supplied with the request.
   * @returns Active products and promotions required for pricing.
   * @throws ApplicationError When a requested product or coupon is invalid.
   */
  async read(
    skus: readonly string[],
    couponCode?: string,
  ): Promise<PricingSnapshot> {
    return this.prisma.$transaction(async (tx) => {
      const storedProducts = await tx.product.findMany({
        where: {
          sku: { in: [...skus] },
          active: true,
        },
        select: {
          id: true,
          sku: true,
          name: true,
          pricePence: true,
        },
      });

      const foundSkus = new Set(storedProducts.map((product) => product.sku));
      const missingSkus = skus.filter((sku) => !foundSkus.has(sku));

      if (missingSkus.length > 0) {
        throw new ApplicationError(
          "UNKNOWN_PRODUCT",
          "One or more products are unknown or inactive.",
          { skus: missingSkus },
        );
      }

      for (const product of storedProducts) {
        invariant(
          Number.isSafeInteger(product.pricePence) &&
            product.pricePence >= 0 &&
            product.pricePence <= LIMITS.unitPricePence,
          "Invalid stored product price.",
        );
      }

      const coupon =
        couponCode === undefined
          ? null
          : await tx.coupon.findUnique({
              where: { code: couponCode },
              include: { promotion: true },
            });

      if (
        couponCode !== undefined &&
        (!coupon || !coupon.active || !coupon.promotion.active)
      ) {
        throw new ApplicationError(
          "INVALID_COUPON",
          "Coupon is unknown or inactive.",
        );
      }

      if (coupon) {
        invariant(
          coupon.promotion.type === "PERCENTAGE_OFF",
          "Unsupported coupon promotion.",
        );
      }

      const productIds = storedProducts.map((product) => product.id);

      const offers = await tx.promotion.findMany({
        where: {
          active: true,
          OR: [
            {
              type: { not: "PERCENTAGE_OFF" },
              products: {
                some: {
                  productId: {
                    in: productIds,
                  },
                },
              },
            },
            ...(coupon ? [{ id: coupon.promotionId }] : []),
          ],
        },
        include: {
          products: {
            include: {
              product: {
                select: {
                  sku: true,
                },
              },
            },
          },
        },
      });

      const promotions: Promotion[] = offers.map((offer) => {
        invariant(
          Number.isSafeInteger(offer.priority) && offer.priority >= 0,
          "Invalid stored promotion priority.",
        );

        const base = {
          code: offer.code,
          name: offer.name,
          priority: offer.priority,
        };

        switch (offer.type) {
          case "BUY_THREE_PAY_TWO":
            invariant(
              offer.percentageOff === null,
              "Multi-buy cannot have a percentage.",
            );

            return {
              ...base,
              type: "BUY_THREE_PAY_TWO",
              eligibleSkus: offer.products.map((link) => link.product.sku),
            };

          case "PERCENTAGE_OFF":
            invariant(
              coupon && coupon.promotionId === offer.id,
              "Coupon does not match offer.",
            );
            invariant(
              offer.products.length === 0,
              "Percentage coupon must apply to the basket.",
            );
            invariant(
              offer.percentageOff !== null &&
                Number.isInteger(offer.percentageOff) &&
                offer.percentageOff >= 1 &&
                offer.percentageOff <= 100,
              "Invalid stored percentage.",
            );

            return {
              ...base,
              type: "PERCENTAGE_OFF",
              percentageOff: offer.percentageOff,
              couponCode: coupon.code,
            };

          default:
            throw new Error(`Unsupported promotion type: ${offer.type}`);
        }
      });

      const products = storedProducts.map((product) => ({
        sku: product.sku,
        name: product.name,
        pricePence: product.pricePence,
      }));

      return { products, promotions };
    });
  }
}