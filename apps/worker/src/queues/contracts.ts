import { idSchema, isoDateTimeSchema } from "@wifi/contracts";
import { z } from "zod";

export const WORKER_QUEUE_KEYS = ["outbox", "accounting", "exports", "retention"] as const;
export const workerQueueKeySchema = z.enum(WORKER_QUEUE_KEYS);
export type WorkerQueueKey = z.infer<typeof workerQueueKeySchema>;

const correlationIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[a-zA-Z0-9._:-]+$/);

const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(160)
  .regex(/^[a-zA-Z0-9._:/-]+$/);

const baseJobDataShape = {
  version: z.literal(1),
  tenantId: idSchema,
  correlationId: correlationIdSchema,
  idempotencyKey: idempotencyKeySchema,
  requestedAt: isoDateTimeSchema,
} as const;

export const outboxJobDataSchema = z
  .object({
    ...baseJobDataShape,
    outboxEventId: idSchema,
    claimToken: idSchema,
  })
  .strict();
export type OutboxJobData = z.infer<typeof outboxJobDataSchema>;

export const accountingJobDataSchema = z
  .object({
    ...baseJobDataShape,
    accountingInboxId: idSchema,
    claimToken: idSchema,
  })
  .strict();
export type AccountingJobData = z.infer<typeof accountingJobDataSchema>;

export const exportJobDataSchema = z
  .object({
    ...baseJobDataShape,
    exportId: idSchema,
  })
  .strict();
export type ExportJobData = z.infer<typeof exportJobDataSchema>;

export const retentionJobDataSchema = z
  .object({
    ...baseJobDataShape,
    retentionRunId: idSchema,
    mode: z.enum(["dry-run", "apply"]),
    policySnapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
    approvalReference: z.string().min(8).max(160).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "apply" && !value.approvalReference) {
      context.addIssue({
        code: "custom",
        path: ["approvalReference"],
        message: "An approved retention run requires an approval reference",
      });
    }
  });
export type RetentionJobData = z.infer<typeof retentionJobDataSchema>;

export interface WorkerJobDataByQueue {
  readonly outbox: OutboxJobData;
  readonly accounting: AccountingJobData;
  readonly exports: ExportJobData;
  readonly retention: RetentionJobData;
}

export const WORKER_JOB_NAMES = {
  outbox: "outbox.dispatch",
  accounting: "accounting.reconcile",
  exports: "export.generate",
  retention: "retention.execute",
} as const satisfies Record<WorkerQueueKey, string>;

export type WorkerJobName = (typeof WORKER_JOB_NAMES)[WorkerQueueKey];

export const JOB_DATA_SCHEMAS = {
  outbox: outboxJobDataSchema,
  accounting: accountingJobDataSchema,
  exports: exportJobDataSchema,
  retention: retentionJobDataSchema,
} as const;

export interface WorkerJobResult {
  readonly status: "processed" | "already-applied";
  readonly completedAt: string;
}

export interface DurableHandlerResult {
  /**
   * `already-applied` must be established from the durable source of truth, not
   * solely from Redis. Redis is only a duplicate-work optimisation.
   */
  readonly status: "processed" | "already-applied";
}

export interface JobExecutionContext {
  readonly queue: WorkerQueueKey;
  readonly jobId: string;
  readonly attempt: number;
  readonly deadlineAt: Date;
  readonly signal: AbortSignal;
}

export interface DurableJobHandler<TData> {
  /**
   * Implementations verify the bounded durable claim transported by the job and
   * commit one tenant-scoped operation with compare-and-swap semantics. They
   * must treat a repeated call as `already-applied` only when the source of
   * truth proves that checkpoint.
   */
  handle(data: Readonly<TData>, context: JobExecutionContext): Promise<DurableHandlerResult>;
}

export type WorkerHandlers = {
  readonly [TQueue in WorkerQueueKey]: DurableJobHandler<WorkerJobDataByQueue[TQueue]>;
};
