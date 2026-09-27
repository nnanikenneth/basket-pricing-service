import { PrismaClient } from "@prisma/client";

/**
 * Creates the Prisma client used by the application.
 *
 * The database URL is supplied explicitly so application configuration remains
 * outside the data-access layer and tests can provide isolated database files.
 *
 * @param databaseUrl Prisma-compatible database connection URL.
 * @returns Configured Prisma client instance.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });
}