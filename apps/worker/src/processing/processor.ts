import { randomUUID } from "node:crypto";
import { UnrecoverableError, type Job, type Processor } from "bullmq";
import type { Logger } from "pino";
import { z } from "zod";
import type { WorkerEnvironment } from "../config/environment.js";
import { runWithJobContext } from "../logging/job-context.js";
import { safeErrorFields } from "../logging/logger.js";
import type { DurableJobHandler, WorkerJobResult, WorkerQueueKey } from "../queues/contracts.js";
import { PermanentJobError, RetryableJobError } from "./errors.js";
import {
  operationFingerprint,
  type IdempotencyClaim,
  type IdempotencyScope,
  type IdempotencyStore,
} from "./idempotency-store.js";

interface RequiredJobFields {
  readonly tenantId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
}

const durableHandlerResultSchema = z.object({
  status: z.enum(["processed", "already-applied"]),
});

export interface ProcessorOptions<TData extends RequiredJobFields, TName extends string> {
  readonly queue: WorkerQueueKey;
  readonly jobName: TName;
  readonly schema: z.ZodType<TData>;
  readonly handler: DurableJobHandler<TData>;
  readonly idempotencyStore: IdempotencyStore;
  readonly environment: WorkerEnvironment;
  readonly logger: Logger;
  readonly now?: () => Date;
  readonly ownerToken?: () => string;
}

export function createIdempotentProcessor<TData extends RequiredJobFields, TName extends string>(
  options: ProcessorOptions<TData, TName>,
): Processor<TData, WorkerJobResult, TName> {
  const now = options.now ?? (() => new Date());
  const createOwnerToken = options.ownerToken ?? randomUUID;

  return async (
    job: Job<TData, WorkerJobResult, TName>,
    _bullMqToken?: string,
    bullMqSignal?: AbortSignal,
  ): Promise<WorkerJobResult> => {
    if (job.name !== options.jobName || !job.id) {
      throw new UnrecoverableError("INVALID_JOB_ENVELOPE");
    }
    const jobId = job.id;

    const parsed = options.schema.safeParse(job.data);
    if (!parsed.success) {
      options.logger.warn(
        { queue: options.queue, jobId: job.id, validationIssueCount: parsed.error.issues.length },
        "Rejected invalid job payload",
      );
      throw new UnrecoverableError("INVALID_JOB_PAYLOAD");
    }

    const data = parsed.data;
    const scope: IdempotencyScope = {
      queue: options.queue,
      tenantId: data.tenantId,
      idempotencyKey: data.idempotencyKey,
    };
    const fingerprint = operationFingerprint(options.queue, data);
    const ownerToken = createOwnerToken();

    return runWithJobContext(
      {
        correlationId: data.correlationId,
        tenantId: data.tenantId,
        queue: options.queue,
        jobId,
      },
      async () => {
        let claim: IdempotencyClaim;
        try {
          claim = await options.idempotencyStore.claim(
            scope,
            fingerprint,
            ownerToken,
            options.environment.WORKER_IDEMPOTENCY_LOCK_TTL_MS,
          );
        } catch (error) {
          options.logger.error(safeErrorFields(error), "Failed to claim idempotency lease");
          // Redis errors may embed connection details. BullMQ stores only this code.
          // eslint-disable-next-line preserve-caught-error
          throw new Error("IDEMPOTENCY_CLAIM_FAILED");
        }

        if (claim.state === "conflict") {
          throw new UnrecoverableError("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD");
        }
        if (claim.state === "busy") {
          throw new RetryableJobError("IDEMPOTENCY_LOCK_BUSY");
        }
        if (claim.previouslyCompleted) {
          options.logger.info(
            "Completed marker found; durable handler will still verify source of truth",
          );
        }

        try {
          const result = await executeWithDeadline(
            (signal) =>
              options.handler.handle(data, {
                queue: options.queue,
                jobId,
                attempt: Math.max(1, job.attemptsStarted),
                deadlineAt: new Date(
                  now().getTime() + options.environment.WORKER_PROCESSING_TIMEOUT_MS,
                ),
                signal,
              }),
            options.environment.WORKER_PROCESSING_TIMEOUT_MS,
            bullMqSignal,
          );
          const validatedResult = durableHandlerResultSchema.safeParse(result);
          if (!validatedResult.success) {
            throw new PermanentJobError("HANDLER_CONTRACT_VIOLATION");
          }

          const completed = await options.idempotencyStore.complete(
            scope,
            fingerprint,
            ownerToken,
            options.environment.WORKER_IDEMPOTENCY_RESULT_TTL_SECONDS,
          );
          if (!completed) {
            throw new RetryableJobError("IDEMPOTENCY_COMPLETION_RACE");
          }

          options.logger.info({ outcome: validatedResult.data.status }, "Job completed durably");
          return {
            status: validatedResult.data.status,
            completedAt: now().toISOString(),
          };
        } catch (error) {
          await releaseBestEffort(options.idempotencyStore, scope, ownerToken, options.logger);
          options.logger.error(safeErrorFields(error), "Job execution failed");

          if (error instanceof PermanentJobError) {
            // Do not attach handler errors as a cause: BullMQ persists failures and
            // an upstream error may contain tenant data.
            throw new UnrecoverableError(error.message);
          }
          if (error instanceof RetryableJobError) {
            // Persist only the allowlisted code, never the original error/cause.
            // eslint-disable-next-line preserve-caught-error
            throw new Error(error.code);
          }
          // Persist only a generic failure; the safe structured log is above.
          // eslint-disable-next-line preserve-caught-error
          throw new Error("JOB_HANDLER_FAILED");
        }
      },
    );
  };
}

async function releaseBestEffort(
  store: IdempotencyStore,
  scope: IdempotencyScope,
  ownerToken: string,
  logger: Logger,
): Promise<void> {
  try {
    const released = await store.release(scope, ownerToken);
    if (!released) {
      logger.warn("Idempotency lock was no longer owned during release");
    }
  } catch (error) {
    logger.error(safeErrorFields(error), "Failed to release idempotency lock");
  }
}

async function executeWithDeadline<TResult>(
  operation: (signal: AbortSignal) => Promise<TResult>,
  timeoutMs: number,
  upstreamSignal?: AbortSignal,
): Promise<TResult> {
  const timeoutController = new AbortController();
  const signal = upstreamSignal
    ? AbortSignal.any([upstreamSignal, timeoutController.signal])
    : timeoutController.signal;
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      timeoutController.abort(new RetryableJobError("JOB_PROCESSING_TIMEOUT"));
      reject(new RetryableJobError("JOB_PROCESSING_TIMEOUT"));
    }, timeoutMs);
    timeoutHandle.unref();
  });

  try {
    return await Promise.race([operation(signal), timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
