import type { FastifyError, FastifyInstance } from "fastify";
import { ApplicationError } from "../../shared/errors/application-error.js";

/**
 * Registers the shared HTTP error and not-found handlers.
 *
 * Maps expected application and Fastify failures to the API's stable error
 * envelope, including an error code and request ID. Unexpected server errors
 * are logged and returned to callers as a generic internal error so internal
 * implementation details are not exposed.
 *
 * @param app Fastify application on which the handlers are registered.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    let mapped: ApplicationError;

    if (error instanceof ApplicationError) {
      mapped = error;
    } else if (error.statusCode === 429) {
      mapped = new ApplicationError(
        "RATE_LIMIT_EXCEEDED",
        "Too many requests. Retry after the delay specified in the Retry-After header.",
      );
    } else if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      mapped = new ApplicationError(
        "PAYLOAD_TOO_LARGE",
        "Request body is too large.",
      );
    } else if (error.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
      mapped = new ApplicationError(
        "UNSUPPORTED_MEDIA_TYPE",
        "Use application/json.",
      );
    } else if (error.validation) {
      const details = error.validation.map((issue) => {
        let path = issue.instancePath;

        if (
          issue.keyword === "required" &&
          typeof issue.params.missingProperty === "string"
        ) {
          // Escape the property name as a JSON Pointer segment.
          const property = issue.params.missingProperty
            .replace(/~/g, "~0")
            .replace(/\//g, "~1");

          path = `${path}/${property}`;
        }

        return {
          path,
          message: issue.message ?? "Invalid value.",
        };
      });

      mapped = new ApplicationError(
        "INVALID_REQUEST",
        "Request validation failed.",
        details,
      );
    } else if (error.statusCode === 400) {
      mapped = new ApplicationError("INVALID_REQUEST", "Invalid request.");
    } else {
      mapped = new ApplicationError(
        "INTERNAL_ERROR",
        "An unexpected error occurred.",
      );
    }

    if (mapped.statusCode >= 500) {
      request.log.error({ err: error }, "Request failed");
    }

    return reply.code(mapped.statusCode).send({
      error: {
        code: mapped.code,
        message: mapped.message,
        requestId: request.id,
        ...(mapped.details === undefined ? {} : { details: mapped.details }),
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
        requestId: request.id,
      },
    });
  });
}