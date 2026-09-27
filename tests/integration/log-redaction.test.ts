import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { finished } from "node:stream/promises";
import { test } from "node:test";
import { buildApp } from "../../src/app.js";

test("redacts sensitive headers while preserving useful log fields", async () => {
  const chunks: string[] = [];

  const stream = new Writable({
    decodeStrings: false,
    write(chunk: string, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  const secrets = {
    authorization: "Bearer test-private-token",
    cookie: "session=test-private-session",
    proxyAuthorization: "Basic test-private-proxy",
    apiKey: "test-private-api-key",
    setCookie: "session=test-private-response; HttpOnly",
  };

  try {
    const app = await buildApp({
      reader: {
        async read() {
          throw new Error("This logging test must not read pricing data.");
        },
      },
      checkDatabase: async () => undefined,
      closeDatabase: async () => undefined,
      logLevel: "info",
      logStream: stream,
    });

    try {
      // Default serializers may omit headers entirely.
      // Preserve these synthetic fields so the test exercises redaction,
      // rather than passing simply because headers were never serialized.
      const logger = app.log.child(
        {},
        {
          serializers: {
            req: (value: unknown) => value,
            res: (value: unknown) => value,
          },
        },
      );

      logger.info(
        {
          reqId: "redaction-test",
          req: {
            method: "POST",
            headers: {
              authorization: secrets.authorization,
              cookie: secrets.cookie,
              "proxy-authorization": secrets.proxyAuthorization,
              "x-api-key": secrets.apiKey,
              "content-type": "application/json",
            },
          },
          res: {
            statusCode: 200,
            headers: {
              "set-cookie": [secrets.setCookie],
              "content-type": "application/json",
            },
          },
        },
        "Redaction verification",
      );
    } finally {
      await app.close();
    }
  } finally {
    stream.end();
    await finished(stream);
  }

  const output = chunks.join("");

  for (const secret of Object.values(secrets)) {
    assert.ok(
      !output.includes(secret),
      "Sensitive header value appeared in log output",
    );
  }

  const entries = output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assert.equal(entries.length, 1, output);

  const entry = entries[0];
  assert.ok(entry);
  assert.equal(entry.msg, "Redaction verification");
  assert.equal(entry.reqId, "redaction-test");
  assert.equal(entry.req.method, "POST");
  assert.equal(entry.res.statusCode, 200);

  assert.deepEqual(entry.req.headers, {
    authorization: "[REDACTED]",
    cookie: "[REDACTED]",
    "proxy-authorization": "[REDACTED]",
    "x-api-key": "[REDACTED]",
    "content-type": "application/json",
  });

  assert.deepEqual(entry.res.headers, {
    "set-cookie": "[REDACTED]",
    "content-type": "application/json",
  });
});