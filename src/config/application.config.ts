import { Value } from "@sinclair/typebox/value";
import {
  environmentSchema,
  type ApplicationConfig,
} from "./environment.schema.js";

/**
 * Loads and validates application configuration from environment variables.
 *
 * @param env Environment source, defaulting to the current process environment.
 * @returns Validated application configuration.
 * @throws Error When one or more configuration values are invalid or missing.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): ApplicationConfig {
  const config = {
    host: env.HOST ?? "0.0.0.0",
    port: Number(env.PORT ?? "3000"),
    databaseUrl: env.DATABASE_URL,
    logLevel: env.LOG_LEVEL ?? "info",
  };

  if (!Value.Check(environmentSchema, config)) {
    throw new Error(
      "Invalid configuration. Set DATABASE_URL to a SQLite file: URL, " +
        "PORT to an integer between 1 and 65535, HOST to a nonempty value " +
        "without whitespace, and LOG_LEVEL to fatal, error, warn, info, " +
        "debug, trace, or silent.",
    );
  }

  return config;
}