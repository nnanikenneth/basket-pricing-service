export const badRequestResponseExample = {
  error: {
    code: "UNKNOWN_PRODUCT",
    message: "One or more products are unknown or inactive.",
    requestId: "req-1",
    details: {
      skus: ["MISSING-001"],
    },
  },
};

export const payloadTooLargeResponseExample = {
  error: {
    code: "PAYLOAD_TOO_LARGE",
    message: "Request body is too large.",
    requestId: "req-1",
  },
};

export const unsupportedMediaTypeResponseExample = {
  error: {
    code: "UNSUPPORTED_MEDIA_TYPE",
    message: "Use application/json.",
    requestId: "req-1",
  },
};

export const rateLimitExceededResponseExample = {
  error: {
    code: "RATE_LIMIT_EXCEEDED",
    message:
      "Too many requests. Retry after the delay specified in the Retry-After header.",
    requestId: "req-1",
  },
};

export const internalErrorResponseExample = {
  error: {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    requestId: "req-1",
  },
};