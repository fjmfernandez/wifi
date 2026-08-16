import { randomUUID } from "node:crypto";
import { createWorkerDatabaseClient } from "@wifi-entelsat/database";
import { parseEnvironment } from "./config/environment.js";
import { PrismaJobRepository, WorkerDatabaseDependency } from "./database/prisma-job-repository.js";
import { AccountingJobHandler } from "./handlers/accounting-handler.js";
import { createLogger, safeErrorFields } from "./logging/logger.js";
import { AccountingClaimPoller } from "./polling/claim-poller.js";
import { WorkerRuntime } from "./runtime/worker-runtime.js";

async function bootstrap(): Promise<void> {
  const environment = parseEnvironment(process.env);
  const workerId = randomUUID();
  const logger = createLogger(environment).child({ workerId });
  const databaseClient = createWorkerDatabaseClient(environment.DATABASE_URL, {
    applicationName: `wifi-worker-${workerId}`,
    connectionLimit: environment.WORKER_DATABASE_CONNECTION_LIMIT,
    connectionTimeoutMillis: environment.WORKER_DATABASE_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: environment.WORKER_DATABASE_IDLE_TIMEOUT_MS,
  });
  const repository = new PrismaJobRepository(databaseClient);
  const database = new WorkerDatabaseDependency(databaseClient);
  let runtime: WorkerRuntime | undefined;

  try {
    runtime = new WorkerRuntime(
      environment,
      { accounting: new AccountingJobHandler(repository, workerId) },
      logger,
      {
        database,
        claimPollerFactories: {
          accounting: (queues) =>
            new AccountingClaimPoller({
              repository,
              queues,
              environment,
              workerId,
              logger,
            }),
        },
      },
    );
    await runtime.start();
  } catch (error) {
    if (runtime) {
      await runtime.shutdown("bootstrap_failure");
    } else {
      await database.close();
    }
    throw error;
  }

  let terminating = false;
  const terminate = (signal: string, exitCode: number): void => {
    if (terminating) {
      return;
    }
    terminating = true;
    process.exitCode = exitCode;
    void runtime.shutdown(signal).catch((error: unknown) => {
      logger.fatal(safeErrorFields(error), "Worker shutdown failed");
      process.exitCode = 1;
    });
  };

  process.once("SIGTERM", () => terminate("SIGTERM", 0));
  process.once("SIGINT", () => terminate("SIGINT", 0));
  process.once("uncaughtException", (error) => {
    logger.fatal(safeErrorFields(error), "Uncaught exception");
    terminate("uncaughtException", 1);
  });
  process.once("unhandledRejection", (error) => {
    logger.fatal(safeErrorFields(error), "Unhandled rejection");
    terminate("unhandledRejection", 1);
  });
}

bootstrap().catch((error: unknown) => {
  const fallback = console;
  fallback.error(
    JSON.stringify({
      level: "fatal",
      service: "wifi-worker",
      message: "Worker bootstrap failed",
      ...safeErrorFields(error),
    }),
  );
  process.exitCode = 1;
});
