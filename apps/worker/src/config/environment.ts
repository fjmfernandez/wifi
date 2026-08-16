import { z } from "zod";
import { type WorkerQueueKey, workerQueueKeySchema } from "../queues/contracts.js";

const booleanStringSchema = z.enum(["true", "false"]).transform((value) => value === "true");

const redisUrlSchema = z.string().superRefine((value, context) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
      context.addIssue({ code: "custom", message: "REDIS_URL must use redis:// or rediss://" });
    }
    if (!url.hostname) {
      context.addIssue({ code: "custom", message: "REDIS_URL must include a hostname" });
    }
  } catch {
    context.addIssue({ code: "custom", message: "REDIS_URL must be a valid URL" });
  }
});

const databaseUrlSchema = z.string().superRefine((value, context) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
      context.addIssue({
        code: "custom",
        message: "DATABASE_URL must use postgresql:// or postgres://",
      });
    }
    if (!url.hostname || !url.pathname || url.pathname === "/") {
      context.addIssue({ code: "custom", message: "DATABASE_URL must include host and database" });
    }
  } catch {
    context.addIssue({ code: "custom", message: "DATABASE_URL must be a valid URL" });
  }
});

const rawEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  WORKER_HEALTH_HOST: z.string().min(1).default("0.0.0.0"),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).default(3003),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  BUILD_SHA: z.string().min(7).max(64).default("development"),
  DATABASE_URL: databaseUrlSchema,
  WORKER_DATABASE_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  WORKER_DATABASE_CONNECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(500)
    .max(30_000)
    .default(5_000),
  WORKER_DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  REDIS_URL: redisUrlSchema,
  REDIS_QUEUE_PREFIX: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default("wifi"),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
  REDIS_TLS_REJECT_UNAUTHORIZED: booleanStringSchema.default(true),
  WORKER_REQUIRED_QUEUES: z.string().default("accounting"),
  WORKER_CLAIM_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000).default(1_000),
  WORKER_CLAIM_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(32),
  WORKER_DATABASE_LEASE_SECONDS: z.coerce.number().int().min(5).max(900).default(300),
  WORKER_POLLER_STALE_AFTER_MS: z.coerce.number().int().min(1_000).max(300_000).default(10_000),
  WORKER_OUTBOX_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(8),
  WORKER_ACCOUNTING_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(16),
  WORKER_EXPORTS_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  WORKER_RETENTION_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  WORKER_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(8),
  WORKER_BACKOFF_MS: z.coerce.number().int().min(250).max(60_000).default(1_000),
  WORKER_LOCK_DURATION_MS: z.coerce.number().int().min(30_000).max(900_000).default(120_000),
  WORKER_PROCESSING_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(840_000).default(90_000),
  WORKER_IDEMPOTENCY_LOCK_TTL_MS: z.coerce
    .number()
    .int()
    .min(30_000)
    .max(1_800_000)
    .default(180_000),
  WORKER_IDEMPOTENCY_RESULT_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(3_600)
    .max(2_592_000)
    .default(604_800),
  WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  WORKER_HEALTH_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(1_500),
  WORKER_REMOVE_COMPLETE_AGE_SECONDS: z.coerce
    .number()
    .int()
    .min(3_600)
    .max(2_592_000)
    .default(86_400),
  WORKER_REMOVE_COMPLETE_COUNT: z.coerce.number().int().min(100).max(1_000_000).default(10_000),
  WORKER_REMOVE_FAILED_AGE_SECONDS: z.coerce
    .number()
    .int()
    .min(86_400)
    .max(7_776_000)
    .default(604_800),
  WORKER_REMOVE_FAILED_COUNT: z.coerce.number().int().min(100).max(1_000_000).default(50_000),
});

type RawEnvironment = z.infer<typeof rawEnvironmentSchema>;

export interface WorkerEnvironment extends RawEnvironment {
  readonly requiredQueues: readonly WorkerQueueKey[];
  readonly concurrency: Readonly<Record<WorkerQueueKey, number>>;
}

export function parseEnvironment(input: Record<string, unknown>): WorkerEnvironment {
  const parsed = rawEnvironmentSchema.parse(input);
  const queueValues = parsed.WORKER_REQUIRED_QUEUES.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const queueResult = z.array(workerQueueKeySchema).min(1).safeParse(queueValues);

  if (!queueResult.success) {
    throw new Error("WORKER_REQUIRED_QUEUES must contain known queue names");
  }

  if (new Set(queueResult.data).size !== queueResult.data.length) {
    throw new Error("WORKER_REQUIRED_QUEUES must not contain duplicates");
  }

  if (parsed.WORKER_PROCESSING_TIMEOUT_MS >= parsed.WORKER_IDEMPOTENCY_LOCK_TTL_MS) {
    throw new Error("WORKER_PROCESSING_TIMEOUT_MS must be lower than the idempotency lock TTL");
  }

  if (
    parsed.WORKER_DATABASE_LEASE_SECONDS * 1_000 <=
    parsed.WORKER_PROCESSING_TIMEOUT_MS + parsed.WORKER_CLAIM_INTERVAL_MS
  ) {
    throw new Error("The database claim lease must exceed the processing and polling deadline");
  }

  if (parsed.WORKER_POLLER_STALE_AFTER_MS <= parsed.WORKER_CLAIM_INTERVAL_MS) {
    throw new Error("WORKER_POLLER_STALE_AFTER_MS must exceed the claim polling interval");
  }

  if (parsed.NODE_ENV === "production") {
    const redisUrl = new URL(parsed.REDIS_URL);
    const databaseUrl = new URL(parsed.DATABASE_URL);
    if (!redisUrl.password) {
      throw new Error("REDIS_URL must include authentication in production");
    }
    if (!databaseUrl.password) {
      throw new Error("DATABASE_URL must include authentication in production");
    }
  }

  return {
    ...parsed,
    requiredQueues: queueResult.data,
    concurrency: {
      outbox: parsed.WORKER_OUTBOX_CONCURRENCY,
      accounting: parsed.WORKER_ACCOUNTING_CONCURRENCY,
      exports: parsed.WORKER_EXPORTS_CONCURRENCY,
      retention: parsed.WORKER_RETENTION_CONCURRENCY,
    },
  };
}
