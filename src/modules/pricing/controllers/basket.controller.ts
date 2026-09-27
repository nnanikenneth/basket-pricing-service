import type {} from "@fastify/swagger";
import type {} from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

import { ApplicationError } from "../../../shared/errors/application-error.js";
import {
  badRequestResponseExample,
  internalErrorResponseExample,
  payloadTooLargeResponseExample,
  rateLimitExceededResponseExample,
  unsupportedMediaTypeResponseExample,
} from "../schemas/examples/error-response.examples.js";
import {
  priceBasketRequestSchema,
  type PriceBasketRequest,
} from "../schemas/price-basket.request.js";
import {
  errorResponseSchema,
  priceBasketResponseSchema,
} from "../schemas/price-basket.response.js";
import type { BasketPricingService } from "../services/basket-pricing.service.js";

/**
 * Registers the basket-pricing HTTP endpoint.
 *
 * The controller defines the HTTP contract, enforces JSON content type and
 * route-level rate limiting, and delegates pricing behaviour to the service.
 * Request and response schemas are also used to generate the OpenAPI
 * documentation exposed through Swagger UI.
 *
 * @param app Fastify application on which the pricing route is registered.
 * @param service Application service responsible for pricing the basket.
 */
export function registerBasketController(
  app: FastifyInstance,
  service: BasketPricingService,
): void {
  app.post<{ Body: PriceBasketRequest }>(
    "/api/v1/baskets/price",
    {
      config: {
        // Opt this route into the rate-limit defaults registered in app.ts.
        rateLimit: {},
      },
      onRequest: async (request) => {
        const contentType = request.headers["content-type"] ?? "";

        if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
          throw new ApplicationError(
            "UNSUPPORTED_MEDIA_TYPE",
            "Use application/json.",
          );
        }
      },
      schema: {
        tags: ["pricing"],
        summary: "Calculate a basket price with offers and an optional coupon",
        body: priceBasketRequestSchema,
        response: {
          200: {
            ...priceBasketResponseSchema,
            description: "Basket priced successfully.",
          },
          400: {
            ...errorResponseSchema,
            description: "Invalid basket, product, or coupon.",
            examples: [badRequestResponseExample],
          },
          413: {
            ...errorResponseSchema,
            description: "Request body is too large.",
            examples: [payloadTooLargeResponseExample],
          },
          415: {
            ...errorResponseSchema,
            description: "Unsupported media type.",
            examples: [unsupportedMediaTypeResponseExample],
          },
          429: {
            ...errorResponseSchema,
            description: "Rate limit exceeded.",
            examples: [rateLimitExceededResponseExample],
          },
          500: {
            ...errorResponseSchema,
            description: "Unexpected internal server error.",
            examples: [internalErrorResponseExample],
          },
        },
      },
    },
    async (request) => service.price(request.body),
  );
}