import { hostname } from "node:os";
import {
  createNodeRedisClient,
  Worker,
  type ConnectionOptions,
  type IRedisClient,
  type WorkerOptions,
} from "bullmq";
import type { Logger } from "pino";
import type { WorkerEnvironment } from "../config/environment.js";
import { HealthServer } from "../health/health-server.js";
import { evaluateReadiness } from "../health/readiness.js";
import { safeErrorFields } from "../logging/logger.js";
import { RedisIdempotencyStore } from "../processing/idempotency-store.js";
import { createIdempotentProcessor } from "../processing/processor.js";
import type { RuntimeClaimPoller } from "../polling/claim-poller.js";
import {
  JOB_DATA_SCHEMAS,
  WORKER_JOB_NAMES,
  type AccountingJobData,
  type ExportJobData,
  type OutboxJobData,
  type RetentionJobData,
  type WorkerHandlers,
  type WorkerJobResult,
  type WorkerQueueKey,
} from "../queues/contracts.js";
import { QUEUE_NAMES, WorkerQueueClient } from "../queues/queue-client.js";
import {
  attachRedisLogging,
  createWorkerRedisClient,
  type WorkerRedisClient,
} from "../redis/client.js";

type AnyWorker = Worker<unknown, WorkerJobResult, string>;

export function configuredHandlerQueues(
  handlers: Partial<WorkerHandlers>,
): ReadonlySet<WorkerQueueKey> {
  return new Set(
    (Object.keys(handlers) as WorkerQueueKey[]).filter((queue) => handlers[queue] !== undefined),
  );
}

export interface WorkerRuntimeDependencies {
  readonly database?: {
    ping(): Promise<boolean>;
    close(): Promise<void>;
  };
  readonly claimPollerFactories?: Partial<
    Record<"accounting" | "outbox", (queues: WorkerQueueClient) => RuntimeClaimPoller>
  >;
}

export class WorkerRuntime {
  readonly queues: WorkerQueueClient;

  private readonly redis: WorkerRedisClient;
  private readonly bullRedis: IRedisClient;
  private readonly idempotencyStore: RedisIdempotencyStore;
  private readonly healthServer: HealthServer;
  private readonly workers = new Map<WorkerQueueKey, AnyWorker>();
  private readonly claimPollers: Partial<Record<"accounting" | "outbox", RuntimeClaimPoller>> = {};
  private readonly configuredQueues: ReadonlySet<WorkerQueueKey>;
  private readonly runningQueues = new Set<WorkerQueueKey>();
  private started = false;
  private stopping = false;
  private shutdownPromise: Promise<void> | undefined;

  constructor(
    private readonly environment: WorkerEnvironment,
    private readonly handlers: Partial<WorkerHandlers>,
    private readonly logger: Logger,
    private readonly dependencies: WorkerRuntimeDependencies = {},
  ) {
    this.configuredQueues = configuredHandlerQueues(handlers);
    this.redis = createWorkerRedisClient(environment);
    attachRedisLogging(this.redis, logger);
    // BullMQ must receive its public node-redis adapter. Passing the raw client
    // would make the dedicated blocking Worker connection use ioredis command
    // conventions instead of node-redis conventions.
    this.bullRedis = createNodeRedisClient(this.redis);
    this.queues = new WorkerQueueClient(this.bullRedis, environment, logger);
    for (const queue of ["accounting", "outbox"] as const) {
      const factory = dependencies.claimPollerFactories?.[queue];
      if (this.configuredQueues.has(queue) && factory) {
        this.claimPollers[queue] = factory(this.queues);
      }
    }
    this.idempotencyStore = new RedisIdempotencyStore(this.redis, environment.REDIS_QUEUE_PREFIX);
    this.healthServer = new HealthServer(environment, () => this.probeReadiness());
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;

    this.registerConfiguredWorkers();
    for (const queue of ["accounting", "outbox"] as const) {
      if (this.configuredQueues.has(queue)) {
        this.claimPollers[queue]?.start();
      }
    }
    await this.healthServer.listen();

    const missingHandlers = this.environment.requiredQueues.filter(
      (queue) => !this.configuredQueues.has(queue),
    );
    if (missingHandlers.length > 0) {
      this.logger.warn(
        { missingQueues: missingHandlers },
        "Readiness is fail-closed because durable queue handlers are missing",
      );
    }

    this.logger.info(
      {
        healthPort: this.environment.WORKER_HEALTH_PORT,
        configuredQueues: [...this.configuredQueues],
      },
      "Worker runtime started",
    );
  }

  shutdown(reason: string): Promise<void> {
    this.shutdownPromise ??= this.performShutdown(reason);
    return this.shutdownPromise;
  }

  private registerConfiguredWorkers(): void {
    if (this.handlers.outbox) {
      const processor = createIdempotentProcessor({
        queue: "outbox",
        jobName: WORKER_JOB_NAMES.outbox,
        schema: JOB_DATA_SCHEMAS.outbox,
        handler: this.handlers.outbox,
        idempotencyStore: this.idempotencyStore,
        environment: this.environment,
        logger: this.logger,
      });
      this.registerWorker(
        "outbox",
        new Worker<OutboxJobData, WorkerJobResult, typeof WORKER_JOB_NAMES.outbox>(
          QUEUE_NAMES.outbox,
          processor,
          this.workerOptions("outbox"),
        ),
      );
    }

    if (this.handlers.accounting) {
      const processor = createIdempotentProcessor({
        queue: "accounting",
        jobName: WORKER_JOB_NAMES.accounting,
        schema: JOB_DATA_SCHEMAS.accounting,
        handler: this.handlers.accounting,
        idempotencyStore: this.idempotencyStore,
        environment: this.environment,
        logger: this.logger,
      });
      this.registerWorker(
        "accounting",
        new Worker<AccountingJobData, WorkerJobResult, typeof WORKER_JOB_NAMES.accounting>(
          QUEUE_NAMES.accounting,
          processor,
          this.workerOptions("accounting"),
        ),
      );
    }

    if (this.handlers.exports) {
      const processor = createIdempotentProcessor({
        queue: "exports",
        jobName: WORKER_JOB_NAMES.exports,
        schema: JOB_DATA_SCHEMAS.exports,
        handler: this.handlers.exports,
        idempotencyStore: this.idempotencyStore,
        environment: this.environment,
        logger: this.logger,
      });
      this.registerWorker(
        "exports",
        new Worker<ExportJobData, WorkerJobResult, typeof WORKER_JOB_NAMES.exports>(
          QUEUE_NAMES.exports,
          processor,
          this.workerOptions("exports"),
        ),
      );
    }

    if (this.handlers.retention) {
      const processor = createIdempotentProcessor({
        queue: "retention",
        jobName: WORKER_JOB_NAMES.retention,
        schema: JOB_DATA_SCHEMAS.retention,
        handler: this.handlers.retention,
        idempotencyStore: this.idempotencyStore,
        environment: this.environment,
        logger: this.logger,
      });
      this.registerWorker(
        "retention",
        new Worker<RetentionJobData, WorkerJobResult, typeof WORKER_JOB_NAMES.retention>(
          QUEUE_NAMES.retention,
          processor,
          this.workerOptions("retention"),
        ),
      );
    }
  }

  private workerOptions(queue: WorkerQueueKey): WorkerOptions {
    return {
      connection: this.bullRedis as ConnectionOptions,
      prefix: this.environment.REDIS_QUEUE_PREFIX,
      name: `${hostname()}-${process.pid}-${queue}`,
      concurrency: this.environment.concurrency[queue],
      lockDuration: this.environment.WORKER_LOCK_DURATION_MS,
      maxStartedAttempts: this.environment.WORKER_ATTEMPTS * 2,
      maxStalledCount: 2,
      stalledInterval: Math.min(30_000, Math.floor(this.environment.WORKER_LOCK_DURATION_MS / 2)),
      drainDelay: 5,
      metrics: { maxDataPoints: 28_800 },
    };
  }

  private registerWorker<TData, TName extends string>(
    queue: WorkerQueueKey,
    worker: Worker<TData, WorkerJobResult, TName>,
  ): void {
    this.workers.set(queue, worker as unknown as AnyWorker);
    worker.on("ready", () => {
      this.runningQueues.add(queue);
      this.logger.info({ queue }, "Queue consumer ready");
    });
    worker.on("closed", () => {
      this.runningQueues.delete(queue);
      this.logger.info({ queue }, "Queue consumer closed");
    });
    worker.on("completed", (job, result) => {
      this.logger.info({ queue, jobId: job.id, outcome: result.status }, "Queue job completed");
    });
    worker.on("failed", (job, error) => {
      this.logger.warn(
        { queue, jobId: job?.id ?? "unknown", ...safeErrorFields(error) },
        "Queue job failed",
      );
    });
    worker.on("stalled", (jobId) => {
      this.logger.warn({ queue, jobId }, "Queue job stalled and will be recovered");
    });
    worker.on("error", (error) => {
      this.logger.error({ queue, ...safeErrorFields(error) }, "Queue consumer error");
    });
  }

  private async probeReadiness() {
    let redisReady = false;
    if (this.redis.isReady) {
      try {
        const response = await withTimeout(
          this.redis.ping(),
          this.environment.WORKER_HEALTH_TIMEOUT_MS,
          "REDIS_HEALTH_TIMEOUT",
        );
        redisReady = response === "PONG";
      } catch {
        redisReady = false;
      }
    }

    let databaseReady = false;
    if (this.dependencies.database) {
      try {
        databaseReady = await withTimeout(
          this.dependencies.database.ping(),
          this.environment.WORKER_HEALTH_TIMEOUT_MS,
          "DATABASE_HEALTH_TIMEOUT",
        );
      } catch {
        databaseReady = false;
      }
    }

    const readyClaimPollers = new Set<WorkerQueueKey>();
    for (const queue of ["accounting", "outbox"] as const) {
      if (this.claimPollers[queue]?.isReady()) {
        readyClaimPollers.add(queue);
      }
    }

    return evaluateReadiness({
      stopping: this.stopping,
      redisReady,
      databaseReady,
      configuredQueues: this.configuredQueues,
      runningQueues: this.runningQueues,
      readyClaimPollers,
      requiredQueues: this.environment.requiredQueues,
    });
  }

  private async performShutdown(reason: string): Promise<void> {
    this.stopping = true;
    this.logger.info({ reason }, "Worker runtime shutting down");
    const activePollers = Object.values(this.claimPollers).filter(
      (poller): poller is RuntimeClaimPoller => poller !== undefined,
    );
    try {
      await withTimeout(
        Promise.allSettled(activePollers.map((poller) => poller.stop())).then(() => undefined),
        this.environment.WORKER_SHUTDOWN_TIMEOUT_MS,
        "WORKER_POLLER_STOP_TIMEOUT",
      );
    } catch (error) {
      this.logger.error(safeErrorFields(error), "Claim poller stop deadline exceeded");
    }
    const activeWorkers = [...this.workers.values()];

    try {
      await withTimeout(
        Promise.all(activeWorkers.map((worker) => worker.close(false))).then(() => undefined),
        this.environment.WORKER_SHUTDOWN_TIMEOUT_MS,
        "WORKER_DRAIN_TIMEOUT",
      );
    } catch (error) {
      this.logger.error(safeErrorFields(error), "Worker drain deadline exceeded; forcing close");
      await Promise.allSettled(activeWorkers.map((worker) => worker.close(true)));
    }

    await Promise.allSettled([
      this.queues.close(),
      this.healthServer.close(),
      this.dependencies.database?.close(),
    ]);
    if (this.redis.isOpen) {
      this.redis.destroy();
    }
    this.runningQueues.clear();
    this.logger.info("Worker runtime stopped");
  }
}

async function withTimeout<TResult>(
  operation: Promise<TResult>,
  timeoutMs: number,
  errorCode: string,
): Promise<TResult> {
  let handle: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    handle = setTimeout(() => reject(new Error(errorCode)), timeoutMs);
    handle.unref();
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (handle) {
      clearTimeout(handle);
    }
  }
}
