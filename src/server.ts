import { buildApp } from "./app.js";
import { loadConfig } from "./config/application.config.js";
import { createPrismaClient } from "./infrastructure/database/prisma.client.js";
import { PrismaPricingSnapshotReader } from "./modules/pricing/adapters/prisma-pricing-snapshot.adapter.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Initializes application infrastructure and starts the HTTP server.
 *
 * Loads configuration, creates the Prisma client, verifies database access,
 * assembles the Fastify application, and installs graceful shutdown handlers.
 *
 * Startup failures are logged and trigger the same cleanup path used during
 * normal process termination.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const prisma = createPrismaClient(config.databaseUrl);

  async function checkDatabase(): Promise<void> {
    await prisma.product.findFirst({ select: { id: true } });
  }

  const app = await buildApp({
    reader: new PrismaPricingSnapshotReader(prisma),
    checkDatabase,
    closeDatabase: () => prisma.$disconnect(),
    logLevel: config.logLevel,
  }).catch(async (error: unknown) => {
    await prisma.$disconnect();
    throw error;
  });

  let stopping = false;
  let shutdownPromise: Promise<void> | undefined;

  const startup = (async () => {
    await prisma.$connect();
    if (stopping) return;

    await checkDatabase();
    if (stopping) return;

    await app.listen({ host: config.host, port: config.port });
  })();

  /**
   * @param reason Human-readable reason recorded in the shutdown log.
   * @returns The shared shutdown promise.
   */
  function shutdown(reason: string): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;

    shutdownPromise = (async () => {
      app.log.info({ reason }, "Shutting down");

      const timeout = setTimeout(() => {
        app.log.error("Shutdown timed out");
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS);
      timeout.unref();

      try {
        // Let any pending connect or listen finish before closing resources.
        await startup.catch(() => undefined);
        await app.close();
      } catch (error) {
        process.exitCode = 1;
        app.log.error({ err: error }, "Shutdown failed");

        try {
          await prisma.$disconnect();
        } catch (disconnectError) {
          app.log.error({ err: disconnectError }, "Database cleanup failed");
        }
      } finally {
        clearTimeout(timeout);
        process.off("SIGINT", onInterrupt);
        process.off("SIGTERM", onTerminate);
      }
    })();

    return shutdownPromise;
  }

  // Translate operating-system termination signals into the shared shutdown path.
  function onInterrupt(): void {
    void shutdown("SIGINT");
  }

  function onTerminate(): void {
    void shutdown("SIGTERM");
  }

  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);

  try {
    await startup;
  } catch (error) {
    process.exitCode = 1;
    app.log.error({ err: error }, "Startup failed");
    await shutdown("startup failure");
  }
}

void main().catch((error: unknown) => {
  console.error("Unable to initialize the server:", error);
  process.exitCode = 1;
});