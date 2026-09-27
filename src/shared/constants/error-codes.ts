/**
 * Maps stable application error codes to their corresponding HTTP statuses.
 */
export const ERROR_CODES = {
  INVALID_REQUEST: 400,
  UNKNOWN_PRODUCT: 400,
  INVALID_COUPON: 400,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMIT_EXCEEDED: 429,
  INTERNAL_ERROR: 500,
  NOT_READY: 503,
} as const;

/**
 * Union of all supported application error codes.
 */
export type ErrorCode = keyof typeof ERROR_CODES;