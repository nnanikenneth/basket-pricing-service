import {
  ERROR_CODES,
  type ErrorCode,
} from "../constants/error-codes.js";

/**
 * Represents an expected application-level failure that can be mapped to a
 * stable API error code and HTTP status.
 *
 * Optional details may be attached when structured context is useful to the
 * caller, for example the IDs of unknown products.
 */
export class ApplicationError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApplicationError";
    this.statusCode = ERROR_CODES[code];
  }
}

/**
 * Enforces an internal assumption that should hold for valid application data.
 *
 * Unlike ApplicationError, invariant failures represent unexpected internal
 * states rather than normal client-facing validation errors.
 *
 * @param condition Condition that must evaluate to a truthy value.
 * @param message Error message used when the invariant is violated.
 */
export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}