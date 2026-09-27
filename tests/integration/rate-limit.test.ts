import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../../src/app.js";

test(
  "limits pricing requests per IP while keeping health checks available",
  { timeout: 15_000 },
  async () => {
    let pricingReads = 0;

    const app = await buildApp({
      reader: {
        async read() {
          pricingReads += 1;

          return {
            products: [
              {
                sku: "MILK-001",
                name: "Milk",
                pricePence: 155,
              },
            ],
            promotions: [],
          };
        },
      },
      checkDatabase: async () => undefined,
      closeDatabase: async () => undefined,
    });

    const request = {
      method: "POST" as const,
      url: "/api/v1/baskets/price",
      remoteAddress: "192.0.2.1",
      payload: {
        items: [{ sku: "MILK-001", quantity: 1 }],
      },
    };

    try {
      // Exercise the configured allowance on a fresh application instance.
      for (let index = 0; index < 500; index += 1) {
        const response = await app.inject(request);

        assert.equal(
          response.statusCode,
          200,
          `Request ${index + 1}: ${response.body}`,
        );
      }

      assert.equal(pricingReads, 500);

      const blocked = await app.inject(request);

      assert.equal(blocked.statusCode, 429, blocked.body);

      const body = blocked.json();
      assert.equal(body.error.code, "RATE_LIMIT_EXCEEDED");
      assert.equal(typeof body.error.message, "string");
      assert.equal(typeof body.error.requestId, "string");
      assert.ok(body.error.requestId.length > 0);

      const retryAfter = Number(blocked.headers["retry-after"]);
      assert.ok(
        Number.isInteger(retryAfter) &&
          retryAfter > 0 &&
          retryAfter <= 60,
        "Retry-After must contain a positive delay of at most 60 seconds",
      );

      // Rejected requests must not reach the pricing reader.
      assert.equal(pricingReads, 500);

      // Forwarded headers must not bypass the limit when trustProxy is false.
      const spoofed = await app.inject({
        ...request,
        headers: {
          "x-forwarded-for": "192.0.2.99",
        },
      });

      assert.equal(spoofed.statusCode, 429, spoofed.body);
      assert.equal(pricingReads, 500);

      // Another client has its own allowance.
      const otherClient = await app.inject({
        ...request,
        remoteAddress: "192.0.2.2",
      });

      assert.equal(otherClient.statusCode, 200, otherClient.body);
      assert.equal(otherClient.json().totalPence, 155);
      assert.equal(pricingReads, 501);

      // The limited client can still reach both health endpoints.
      for (const [url, status] of [
        ["/health/live", "ok"],
        ["/health/ready", "ready"],
      ] as const) {
        const response = await app.inject({
          method: "GET",
          url,
          remoteAddress: request.remoteAddress,
        });

        assert.equal(response.statusCode, 200, response.body);
        assert.deepEqual(response.json(), { status });
      }
    } finally {
      await app.close();
    }
  },
);