import { Type, type Static } from "@sinclair/typebox";

/**
 * Runtime schema for validated application configuration.
 */
export const environmentSchema = Type.Object({
  host: Type.String({ minLength: 1, pattern: "^\\S+$" }),
  port: Type.Integer({ minimum: 1, maximum: 65_535 }),
  databaseUrl: Type.String({ pattern: "^file:.+" }),
  logLevel: Type.Union([
    Type.Literal("fatal"),
    Type.Literal("error"),
    Type.Literal("warn"),
    Type.Literal("info"),
    Type.Literal("debug"),
    Type.Literal("trace"),
    Type.Literal("silent"),
  ]),
});

/**
 * Statically typed application configuration derived from the runtime schema.
 */
export type ApplicationConfig = Static<typeof environmentSchema>;