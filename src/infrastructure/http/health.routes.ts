import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  liveResponseExample,
  notReadyResponseExample,
  readyResponseExample,
} from "./examples/health-response.example.js";

/**
 * Registers liveness and readiness endpoints for the application.
 *
 * Liveness confirms that the HTTP process is responding. Readiness additionally
 * checks the database dependency and returns a structured 503 response when
 * that dependency is unavailable.
 *
 * @param app Fastify application on which the health routes are registered.
 * @param checkDatabase Dependency check used by the readiness endpoint.
 */
export function registerHealthRoutes(
  app: FastifyInstance,
  checkDatabase: () => Promise<void>,
): void {
  app.get(
    "/health/live",
    {
      schema: {
        response: {
          200: Type.Object(
            {
              status: Type.Literal("ok"),
            },
            {
              description: "Application process is live.",
              examples: [liveResponseExample],
            },
          ),
        },
      },
    },
    async () => ({ status: "ok" }),
  );

  app.get(
    "/health/ready",
    {
      schema: {
        response: {
          200: Type.Object(
            {
              status: Type.Literal("ready"),
            },
            {
              description: "Application is ready to serve requests.",
              examples: [readyResponseExample],
            },
          ),
          503: Type.Object(
            {
              error: Type.Object({
                code: Type.Literal("NOT_READY"),
                message: Type.String(),
                requestId: Type.String(),
              }),
            },
            {
              description: "Database dependency is unavailable.",
              examples: [notReadyResponseExample],
            },
          ),
        },
      },
    },
    async (request, reply) => {
      try {
        await checkDatabase();

        return { status: "ready" };
      } catch (error) {
        request.log.error({ err: error }, "Readiness check failed");

        return reply.code(503).send({
          error: {
            code: "NOT_READY",
            message: "Database unavailable.",
            requestId: request.id,
          },
        });
      }
    },
  );
}