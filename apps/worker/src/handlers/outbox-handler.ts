import type {
  DurableHandlerResult,
  DurableJobHandler,
  JobExecutionContext,
  OutboxJobData,
} from "../queues/contracts.js";
import { PermanentJobError, RetryableJobError } from "../processing/errors.js";
import type { JobRepository, OutboxEvent } from "./job-repository.js";

export interface OutboxPublisher {
  /** Publish idempotently using `event.id` as the destination idempotency key. */
  publish(event: OutboxEvent, context: JobExecutionContext): Promise<void>;
}

export class OutboxJobHandler implements DurableJobHandler<OutboxJobData> {
  constructor(
    private readonly repository: JobRepository,
    private readonly publisher: OutboxPublisher,
    private readonly workerId: string,
  ) {}

  async handle(
    data: Readonly<OutboxJobData>,
    context: JobExecutionContext,
  ): Promise<DurableHandlerResult> {
    assertNotAborted(context.signal);
    const claim = await this.repository.readClaimedOutbox({
      workerId: this.workerId,
      tenantId: data.tenantId,
      outboxEventId: data.outboxEventId,
      claimToken: data.claimToken,
    });
    if (claim.status !== "claimed") {
      if (claim.status === "already-applied") {
        return { status: "already-applied" };
      }
      if (claim.status === "not-found") {
        throw new PermanentJobError("OUTBOX_EVENT_NOT_FOUND");
      }
      throw new RetryableJobError("OUTBOX_CLAIM_LOST");
    }

    try {
      assertNotAborted(context.signal);
      await this.publisher.publish(claim.event, context);
      assertNotAborted(context.signal);
      const checkpoint = await this.repository.completeOutbox({
        workerId: this.workerId,
        tenantId: data.tenantId,
        outboxEventId: data.outboxEventId,
        claimToken: data.claimToken,
      });

      if (checkpoint === "completed") {
        return { status: "processed" };
      }
      if (checkpoint === "already-applied") {
        return { status: "already-applied" };
      }
      if (checkpoint === "not-found") {
        throw new PermanentJobError("OUTBOX_EVENT_NOT_FOUND");
      }
      throw new RetryableJobError("OUTBOX_CLAIM_LOST");
    } catch (error) {
      await failBestEffort(() =>
        this.repository.failOutbox({
          workerId: this.workerId,
          tenantId: data.tenantId,
          outboxEventId: data.outboxEventId,
          claimToken: data.claimToken,
          errorCode: failureCode(error),
          retryAt: new Date(Date.now() + retryDelayMs(context.attempt)),
        }),
      );
      throw error;
    }
  }
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new RetryableJobError("JOB_ABORTED");
  }
}

function failureCode(error: unknown): string {
  if (error instanceof PermanentJobError || error instanceof RetryableJobError) {
    return error.code;
  }
  return "OUTBOX_PUBLISH_FAILED";
}

async function failBestEffort(operation: () => Promise<boolean>): Promise<void> {
  try {
    await operation();
  } catch {
    // The original error controls retry. A stale durable lease expires safely.
  }
}

function retryDelayMs(attempt: number): number {
  return Math.min(1_000 * 2 ** Math.max(0, attempt - 1), 300_000);
}
