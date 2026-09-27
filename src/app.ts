import type { Writable } from "node:stream";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { ApplicationConfig } from "./config/environment.schema.js";
import { registerErrorHandler } from "./infrastructure/http/error-handler.js";
import { registerHealthRoutes } from "./infrastructure/http/health.routes.js";
import { registerBasketController } from "./modules/pricing/controllers/basket.controller.js";
import type { PricingSnapshotReader } from "./modules/pricing/ports/pricing-snapshot-reader.js";
import { BasketPricingService } from "./modules/pricing/services/basket-pricing.service.js";

/**
 * External dependencies required to assemble the Fastify application.
 *
 * Keeping these dependencies explicit allows production infrastructure to be
 * supplied by the server entrypoint while tests can inject isolated readers,
 * database checks, cleanup functions, and log streams.
 */
export interface AppDependencies {
  reader: PricingSnapshotReader;
  checkDatabase: () => Promise<void>;
  closeDatabase: () => Promise<void>;
  logLevel?: ApplicationConfig["logLevel"];
  logStream?: Writable;
}

/**
 * Builds and configures the Fastify application.
 *
 * Configures structured logging and redaction, request validation, rate
 * limiting, Swagger/OpenAPI documentation, shared error handling, pricing
 * routes, and health endpoints.
 *
 * Database lifecycle and pricing data access are injected so this function can
 * assemble the application without creating infrastructure dependencies itself.
 *
 * @param deps Runtime dependencies required by the application.
 * @returns The configured Fastify application, ready to be started or injected in tests.
 */
export async function buildApp(deps: AppDependencies) {
  const app = Fastify({
    logger: deps.logLevel
      ? {
          level: deps.logLevel,
          ...(deps.logStream === undefined
            ? {}
            : { stream: deps.logStream }),
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              'req.headers["proxy-authorization"]',
              'req.headers["x-api-key"]',
              'res.headers["set-cookie"]',
            ],
            censor: "[REDACTED]",
          },
        }
      : false,
    trustProxy: false,
    requestTimeout: 10_000,
    connectionTimeout: 10_000,
    requestIdHeader: false,
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: false,
      },
    },
  });

  app.addHook("onClose", async () => deps.closeDatabase());
  registerErrorHandler(app);

  await app.register(rateLimit, {
    // Routes opt in to rate-limiting so health checks remain available.
    global: false,
    max: 500,
    timeWindow: 60_000,
    hook: "onRequest",
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Basket Pricing API",
        version: "0.1.0",
        description:
          "GBP prices in integer pence. Item offers apply first, " +
          "followed by an optional coupon.",
      },
    },
  });

  await app.register(swaggerUi, { routePrefix: "/docs" });

  const service = new BasketPricingService(deps.reader);
  registerBasketController(app, service);
  registerHealthRoutes(app, deps.checkDatabase);

  return app;
}