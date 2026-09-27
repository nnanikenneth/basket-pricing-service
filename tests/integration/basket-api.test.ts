import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { seed } from "../../prisma/seed.js";
import { buildApp } from "../../src/app.js";
import { createPrismaClient } from "../../src/infrastructure/database/prisma.client.js";
import { PrismaPricingSnapshotReader } from "../../src/modules/pricing/adapters/prisma-pricing-snapshot.adapter.js";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const endpoint = "/api/v1/baskets/price";

const items = [
  { sku: "COFFEE-001", quantity: 1 },
  { sku: "TEA-001", quantity: 1 },
  { sku: "BISCUITS-001", quantity: 1 },
];

test("basket API with SQLite", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "basket-api-"));
  const databaseUrl = `file:${join(directory, "test.db")}`;
  const prisma = createPrismaClient(databaseUrl);
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    await writeFile(join(directory, "test.db"), "");
    execFileSync(
      process.execPath,
      [
        join(projectRoot, "node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        join(projectRoot, "prisma/schema.prisma"),
      ],
      {
        cwd: projectRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        timeout: 20_000,
        stdio: "pipe",
      },
    );
    await seed(prisma);
    const api = await buildApp({
      reader: new PrismaPricingSnapshotReader(prisma),
      checkDatabase: async () => {
        await prisma.product.findFirst({ select: { id: true } });
      },
      closeDatabase: () => prisma.$disconnect(),
    });
    app = api;
    await t.test(
      "calculates offers and coupon from persisted data",
      async () => {
        const response = await api.inject({
          method: "POST",
          url: endpoint,
          payload: { items, couponCode: "SAVE10" },
        });
        assert.equal(response.statusCode, 200, response.body);
        const body = response.json();
        assert.equal(body.currency, "GBP");
        assert.equal(body.subtotalPence, 1000);
        assert.equal(body.totalSavingsPence, 280);
        assert.equal(body.totalPence, 720);
        assert.deepEqual(body.discounts, [
          {
            promotionCode: "THREE_FOR_TWO",
            description: "Buy three qualifying items, pay for two",
            savingPence: 200,
            freeItems: [{ sku: "BISCUITS-001", quantity: 1 }],
          },
          {
            promotionCode: "TEN_PERCENT_OFF",
            description: "10% off the remaining basket",
            savingPence: 80,
            freeItems: [],
            couponCode: "SAVE10",
            basisPence: 800,
          },
        ]);
      },
    );
    await t.test("does not apply a coupon unless requested", async () => {
      const response = await api.inject({
        method: "POST",
        url: endpoint,
        payload: { items },
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().totalPence, 800);
      assert.equal(response.json().discounts.length, 1);
    });
    await t.test("rejects invalid request bodies", async () => {
      const invalidBodies = [
        {},
        { items: [] },
        { items: [{ sku: "COFFEE-001", quantity: "1" }] },
        { items: [{ sku: "COFFEE-001", quantity: 0 }] },
        { items: [{ sku: "COFFEE-001", quantity: 1.5 }] },
        { items, unexpected: true },
        { items, couponCode: "save10" },
        {
          items: [
            { sku: "COFFEE-001", quantity: 600 },
            { sku: "TEA-001", quantity: 600 },
          ],
        },
      ];
      for (const payload of invalidBodies) {
        const response = await api.inject({
          method: "POST",
          url: endpoint,
          payload,
        });
        assert.equal(response.statusCode, 400, JSON.stringify(payload));
        assert.equal(response.json().error.code, "INVALID_REQUEST");
        assert.equal(typeof response.json().error.requestId, "string");
      }
    });
    await t.test(
      "identifies an invalid quantity in validation details",
      async () => {
        const response = await api.inject({
          method: "POST",
          url: endpoint,
          payload: {
            items: [{ sku: "COFFEE-001", quantity: 0 }],
          },
        });
        assert.equal(response.statusCode, 400, response.body);
        const body = response.json();
        assert.equal(body.error.code, "INVALID_REQUEST");
        assert.equal(body.error.message, "Request validation failed.");
        assert.equal(typeof body.error.requestId, "string");
        assert.deepEqual(body.error.details, [
          {
            path: "/items/0/quantity",
            message: "must be >= 1",
          },
        ]);
      },
    );
    await t.test(
      "identifies missing required fields in validation details",
      async () => {
        const cases = [
          {
            payload: {},
            path: "/items",
            property: "items",
          },
          {
            payload: {
              items: [{ sku: "COFFEE-001" }],
            },
            path: "/items/0/quantity",
            property: "quantity",
          },
        ];
        for (const { payload, path, property } of cases) {
          const response = await api.inject({
            method: "POST",
            url: endpoint,
            payload,
          });
          assert.equal(response.statusCode, 400, JSON.stringify(payload));
          const body = response.json();
          assert.equal(body.error.code, "INVALID_REQUEST");
          assert.equal(body.error.message, "Request validation failed.");
          assert.deepEqual(body.error.details, [
            {
              path,
              message: `must have required property '${property}'`,
            },
          ]);
        }
      },
    );
    await t.test("rejects unknown products and coupons", async () => {
      const unknownProduct = await api.inject({
        method: "POST",
        url: endpoint,
        payload: {
          items: [{ sku: "MISSING-001", quantity: 1 }],
        },
      });
      assert.equal(unknownProduct.statusCode, 400);
      assert.equal(unknownProduct.json().error.code, "UNKNOWN_PRODUCT");
      assert.deepEqual(unknownProduct.json().error.details, {
        skus: ["MISSING-001"],
      });
      const unknownCoupon = await api.inject({
        method: "POST",
        url: endpoint,
        payload: { items, couponCode: "MISSING" },
      });
      assert.equal(unknownCoupon.statusCode, 400);
      assert.equal(unknownCoupon.json().error.code, "INVALID_COUPON");
    });
    await t.test(
      "rejects malformed JSON and unsupported content types",
      async () => {
        const malformed = await api.inject({
          method: "POST",
          url: endpoint,
          headers: { "content-type": "application/json" },
          payload: "{",
        });
        assert.equal(malformed.statusCode, 400);
        assert.equal(malformed.json().error.code, "INVALID_REQUEST");
        const unsupported = await api.inject({
          method: "POST",
          url: endpoint,
          headers: { "content-type": "text/plain" },
          payload: "basket",
        });
        assert.equal(unsupported.statusCode, 415);
        assert.equal(unsupported.json().error.code, "UNSUPPORTED_MEDIA_TYPE");
      },
    );
    await t.test("rejects an inactive product", async () => {
      const original = await prisma.product.findUniqueOrThrow({
        where: { sku: "COFFEE-001" },
      });
      try {
        await prisma.product.update({
          where: { id: original.id },
          data: { active: false },
        });
        const response = await api.inject({
          method: "POST",
          url: endpoint,
          payload: { items },
        });
        assert.equal(response.statusCode, 400, response.body);
        assert.equal(response.json().error.code, "UNKNOWN_PRODUCT");
        assert.deepEqual(response.json().error.details, {
          skus: ["COFFEE-001"],
        });
      } finally {
        await prisma.product.update({
          where: { id: original.id },
          data: { active: original.active },
        });
      }
    });
    await t.test(
      "rejects inactive coupons and coupons with inactive promotions",
      async () => {
        const originalCoupon = await prisma.coupon.findUniqueOrThrow({
          where: { code: "SAVE10" },
        });
        const originalPromotion = await prisma.promotion.findUniqueOrThrow({
          where: { id: originalCoupon.promotionId },
        });
        try {
          await prisma.coupon.update({
            where: { code: originalCoupon.code },
            data: { active: false },
          });
          const inactiveCoupon = await api.inject({
            method: "POST",
            url: endpoint,
            payload: { items, couponCode: "SAVE10" },
          });
          assert.equal(inactiveCoupon.statusCode, 400, inactiveCoupon.body);
          assert.equal(inactiveCoupon.json().error.code, "INVALID_COUPON");
          await prisma.coupon.update({
            where: { code: originalCoupon.code },
            data: { active: true },
          });
          await prisma.promotion.update({
            where: { id: originalPromotion.id },
            data: { active: false },
          });
          const inactivePromotion = await api.inject({
            method: "POST",
            url: endpoint,
            payload: { items, couponCode: "SAVE10" },
          });
          assert.equal(
            inactivePromotion.statusCode,
            400,
            inactivePromotion.body,
          );
          assert.equal(inactivePromotion.json().error.code, "INVALID_COUPON");
        } finally {
          await prisma.$transaction([
            prisma.coupon.update({
              where: { code: originalCoupon.code },
              data: { active: originalCoupon.active },
            }),
            prisma.promotion.update({
              where: { id: originalPromotion.id },
              data: { active: originalPromotion.active },
            }),
          ]);
        }
      },
    );
    await t.test("ignores unrelated active item promotions", async () => {
      const promotionCode = "UNRELATED_UNSUPPORTED_PROMOTION";
      try {
        await prisma.promotion.create({
          data: {
            code: promotionCode,
            name: "Unrelated unsupported promotion",
            type: "UNSUPPORTED_TEST_TYPE",
            priority: 50,
            products: {
              create: {
                product: {
                  connect: { sku: "MILK-001" },
                },
              },
            },
          },
        });
        const response = await api.inject({
          method: "POST",
          url: endpoint,
          payload: {
            items: [{ sku: "COFFEE-001", quantity: 1 }],
          },
        });
        assert.equal(response.statusCode, 200, response.body);
        const body = response.json();
        assert.equal(body.subtotalPence, 500);
        assert.equal(body.totalSavingsPence, 0);
        assert.equal(body.totalPence, 500);
        assert.deepEqual(body.discounts, []);
      } finally {
        await prisma.promotion.deleteMany({
          where: { code: promotionCode },
        });
      }
    });
    await t.test(
      "fails safely for invalid stored promotion settings",
      async () => {
        const original = await prisma.promotion.findUniqueOrThrow({
          where: { code: "TEN_PERCENT_OFF" },
        });
        const invalidSettings = [
          { type: original.type, percentageOff: -1 },
          { type: original.type, percentageOff: 101 },
          { type: original.type, percentageOff: null },
          { type: "UNSUPPORTED_TEST_TYPE", percentageOff: 10 },
        ];
        try {
          for (const settings of invalidSettings) {
            await prisma.promotion.update({
              where: { id: original.id },
              data: settings,
            });
            const response = await api.inject({
              method: "POST",
              url: endpoint,
              payload: { items, couponCode: "SAVE10" },
            });
            assert.equal(
              response.statusCode,
              500,
              `${JSON.stringify(settings)}: ${response.body}`,
            );
            const body = response.json();
            assert.equal(typeof body.error.requestId, "string");
            assert.ok(body.error.requestId.length > 0);
            assert.deepEqual(body, {
              error: {
                code: "INTERNAL_ERROR",
                message: "An unexpected error occurred.",
                requestId: body.error.requestId,
              },
            });
          }
        } finally {
          await prisma.promotion.update({
            where: { id: original.id },
            data: {
              type: original.type,
              percentageOff: original.percentageOff,
            },
          });
        }
      },
    );
    await t.test(
      "returns 503 when the readiness dependency fails",
      async () => {
        const diagnostic = "TEST_DATABASE_FAILURE_PRIVATE_DETAIL";
        // Inject a dependency failure without damaging the shared test database.
        const unavailableApi = await buildApp({
          reader: new PrismaPricingSnapshotReader(prisma),
          checkDatabase: async () => {
            throw new Error(diagnostic);
          },
          // The parent test owns this Prisma client.
          closeDatabase: async () => undefined,
        });
        try {
          const readiness = await unavailableApi.inject("/health/ready");
          assert.equal(readiness.statusCode, 503, readiness.body);
          const body = readiness.json();
          assert.equal(body.error.code, "NOT_READY");
          assert.equal(typeof body.error.message, "string");
          assert.equal(typeof body.error.requestId, "string");
          assert.ok(body.error.requestId.length > 0);
          assert.deepEqual(Object.keys(body.error).sort(), [
            "code",
            "message",
            "requestId",
          ]);
          assert.ok(!readiness.body.includes(diagnostic));
          const liveness = await unavailableApi.inject("/health/live");
          assert.equal(liveness.statusCode, 200);
          assert.deepEqual(liveness.json(), { status: "ok" });
        } finally {
          await unavailableApi.close();
        }
      },
    );
    await t.test("reports readiness against the real database", async () => {
      const response = await api.inject("/health/ready");
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { status: "ready" });
    });
  } finally {
    try {
      if (app) await app.close();
    } finally {
      await prisma.$disconnect();
      await rm(directory, { recursive: true, force: true });
    }
  }
});
