export const liveResponseExample = {
  status: "ok",
};

export const readyResponseExample = {
  status: "ready",
};

export const notReadyResponseExample = {
  error: {
    code: "NOT_READY",
    message: "Database unavailable.",
    requestId: "req-1",
  },
};