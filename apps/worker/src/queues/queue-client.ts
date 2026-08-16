import { createHash } from "node:crypto";
import { Queue, type ConnectionOptions, type DefaultJobOptions, type IRedisClient } from "bullmq";
import type { Logger } from "pino";
import type { WorkerEnvironment } from "../config/environment.js";
import { safeErrorFields } from "../logging/logger.js";
import {
  WORKER_JOB_NAMES,
  accountingJobDataSchema,
  exportJobDataSchema,
  outboxJobDataSchema,
  retentionJobDataSchema,
  type AccountingJobData,
  type ExportJobData,
  type OutboxJobData,
  type RetentionJobData,
  type WorkerJobResult,
  type WorkerQueueKey,
} from "./contracts.js";

export const QUEUE_NAMES = {
  outbox: "outbox",
  accounting: "accounting",
  exports: "exports",
  retention: "retention",
} as const satisfies Record<WorkerQueueKey, string>;

export function createStableJobId(queue: WorkerQueueKey, idempotencyKey: string): string {
  const digest = createHash("sha256").update(`${queue}\u0000${idempotencyKey}`).digest("hex");
  // BullMQ reserves ':' in custom job IDs.
  return `wifi-${queue}-${digest.slice(0, 40)}`;
}

function defaultJobOptions(environment: WorkerEnvironment): DefaultJobOptions {
  return {
    attempts: environment.WORKER_ATTEMPTS,
    backoff: {
      type: "exponential",
      delay: environment.WORKER_BACKOFF_MS,
      jitter: 0.25,
    },
    removeOnComplete: {
      age: environment.WORKER_REMOVE_COMPLETE_AGE_SECONDS,
      count: environment.WORKER_REMOVE_COMPLETE_COUNT,
    },
    removeOnFail: {
      age: environment.WORKER_REMOVE_FAILED_AGE_SECONDS,
      count: environment.WORKER_REMOVE_FAILED_COUNT,
    },
    stackTraceLimit: 8,
    sizeLimit: 16_384,
  };
}

export class WorkerQueueClient {
  readonly outbox: Queue<OutboxJobData, WorkerJobResult, typeof WORKER_JOB_NAMES.outbox>;
  readonly accounting: Queue<
    AccountingJobData,
    WorkerJobResult,
    typeof WORKER_JOB_NAMES.accounting
  >;
  readonly exports: Queue<ExportJobData, WorkerJobResult, typeof WORKER_JOB_NAMES.exports>;
  readonly retention: Queue<RetentionJobData, WorkerJobResult, typeof WORKER_JOB_NAMES.retention>;

  constructor(redis: IRedisClient, environment: WorkerEnvironment, logger: Logger) {
    const options = {
      connection: redis as ConnectionOptions,
      prefix: environment.REDIS_QUEUE_PREFIX,
      defaultJobOptions: defaultJobOptions(environment),
      streams: { events: { maxLen: 10_000 } },
    } as const;

    this.outbox = new Queue(QUEUE_NAMES.outbox, options);
    this.accounting = new Queue(QUEUE_NAMES.accounting, options);
    this.exports = new Queue(QUEUE_NAMES.exports, options);
    this.retention = new Queue(QUEUE_NAMES.retention, options);

    for (const [queue, instance] of this.entries()) {
      instance.on("error", (error) => {
        logger.error({ queue, ...safeErrorFields(error) }, "Queue producer error");
      });
    }
  }

  async enqueueOutbox(input: unknown): Promise<string> {
    const data = outboxJobDataSchema.parse(input);
    const job = await this.outbox.add(WORKER_JOB_NAMES.outbox, data, {
      jobId: createStableJobId("outbox", data.idempotencyKey),
    });
    return job.id ?? createStableJobId("outbox", data.idempotencyKey);
  }

  async enqueueAccounting(input: unknown): Promise<string> {
    const data = accountingJobDataSchema.parse(input);
    const job = await this.accounting.add(WORKER_JOB_NAMES.accounting, data, {
      jobId: createStableJobId("accounting", data.idempotencyKey),
    });
    return job.id ?? createStableJobId("accounting", data.idempotencyKey);
  }

  async enqueueExport(input: unknown): Promise<string> {
    const data = exportJobDataSchema.parse(input);
    const job = await this.exports.add(WORKER_JOB_NAMES.exports, data, {
      jobId: createStableJobId("exports", data.idempotencyKey),
    });
    return job.id ?? createStableJobId("exports", data.idempotencyKey);
  }

  async enqueueRetention(input: unknown): Promise<string> {
    const data = retentionJobDataSchema.parse(input);
    const job = await this.retention.add(WORKER_JOB_NAMES.retention, data, {
      jobId: createStableJobId("retention", data.idempotencyKey),
    });
    return job.id ?? createStableJobId("retention", data.idempotencyKey);
  }

  async close(): Promise<void> {
    await Promise.all(this.entries().map(([, queue]) => queue.close()));
  }

  private entries(): ReadonlyArray<
    readonly [WorkerQueueKey, Queue<unknown, WorkerJobResult, string>]
  > {
    return [
      ["outbox", this.outbox as Queue<unknown, WorkerJobResult, string>],
      ["accounting", this.accounting as Queue<unknown, WorkerJobResult, string>],
      ["exports", this.exports as Queue<unknown, WorkerJobResult, string>],
      ["retention", this.retention as Queue<unknown, WorkerJobResult, string>],
    ];
  }
}
