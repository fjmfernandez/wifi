import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import type { WorkerEnvironment } from "../config/environment.js";
import { safeErrorFields } from "../logging/logger.js";
import type { JobRepository } from "../handlers/job-repository.js";
import type { WorkerQueueClient } from "../queues/queue-client.js";

export type ClaimPollerQueue = "accounting" | "outbox";

export interface RuntimeClaimPoller {
  readonly queue: ClaimPollerQueue;
  start(): void;
  stop(): Promise<void>;
  isReady(): boolean;
}

export interface PollerDependencies {
  readonly repository: JobRepository;
  readonly queues: Pick<WorkerQueueClient, "enqueueAccounting" | "enqueueOutbox">;
  readonly environment: WorkerEnvironment;
  readonly workerId: string;
  readonly logger: Logger;
  readonly now?: () => Date;
  readonly correlationId?: () => string;
}

abstract class BaseClaimPoller implements RuntimeClaimPoller {
  abstract readonly queue: ClaimPollerQueue;
  protected readonly now: () => Date;
  protected readonly correlationId: () => string;
  private timer: NodeJS.Timeout | undefined;
  private activePoll: Promise<void> | undefined;
  private running = false;
  private lastSuccessfulPollAt: number | undefined;

  protected constructor(protected readonly dependencies: PollerDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.correlationId = dependencies.correlationId ?? randomUUID;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.schedulePoll();
    this.timer = setInterval(
      () => this.schedulePoll(),
      this.dependencies.environment.WORKER_CLAIM_INTERVAL_MS,
    );
    this.timer.unref();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.activePoll;
  }

  isReady(): boolean {
    return (
      this.running &&
      this.lastSuccessfulPollAt !== undefined &&
      this.now().getTime() - this.lastSuccessfulPollAt <=
        this.dependencies.environment.WORKER_POLLER_STALE_AFTER_MS
    );
  }

  /** Exposed for deterministic unit tests; production scheduling uses `start`. */
  async pollNow(): Promise<void> {
    if (this.activePoll) {
      return this.activePoll;
    }
    const operation = this.pollSafely();
    this.activePoll = operation;
    try {
      await operation;
    } finally {
      this.activePoll = undefined;
    }
  }

  protected abstract pollBatch(): Promise<void>;

  private schedulePoll(): void {
    void this.pollNow();
  }

  private async pollSafely(): Promise<void> {
    try {
      await this.pollBatch();
      this.lastSuccessfulPollAt = this.now().getTime();
    } catch (error) {
      this.dependencies.logger.error(
        { queue: this.queue, ...safeErrorFields(error) },
        "Database claim poll failed",
      );
    }
  }
}

export class AccountingClaimPoller extends BaseClaimPoller {
  readonly queue = "accounting" as const;

  constructor(dependencies: PollerDependencies) {
    super(dependencies);
  }

  async pollBatch(): Promise<void> {
    const { repository, queues, environment, workerId, logger } = this.dependencies;
    const claims = await repository.claimAccountingBatch({
      workerId,
      limit: environment.WORKER_CLAIM_BATCH_SIZE,
      leaseSeconds: environment.WORKER_DATABASE_LEASE_SECONDS,
    });
    let enqueueFailed = false;

    for (const claim of claims) {
      try {
        await queues.enqueueAccounting({
          version: 1,
          tenantId: claim.tenantId,
          accountingInboxId: claim.accountingInboxId,
          claimToken: claim.claimToken,
          correlationId: this.correlationId(),
          idempotencyKey: `accounting/${claim.accountingInboxId}/${claim.claimToken}`,
          requestedAt: this.now().toISOString(),
        });
      } catch (error) {
        enqueueFailed = true;
        logger.error(
          { queue: this.queue, ...safeErrorFields(error) },
          "Failed to enqueue claimed accounting event",
        );
        await failBestEffort(() =>
          repository.failAccounting({
            workerId,
            tenantId: claim.tenantId,
            accountingInboxId: claim.accountingInboxId,
            claimToken: claim.claimToken,
            errorCode: "QUEUE_ENQUEUE_FAILED",
            retryAt: new Date(this.now().getTime() + environment.WORKER_CLAIM_INTERVAL_MS),
          }),
        );
      }
    }
    if (enqueueFailed) {
      throw new PollBatchError("ACCOUNTING_QUEUE_ENQUEUE_FAILED");
    }
  }
}

export class OutboxClaimPoller extends BaseClaimPoller {
  readonly queue = "outbox" as const;

  constructor(dependencies: PollerDependencies) {
    super(dependencies);
  }

  async pollBatch(): Promise<void> {
    const { repository, queues, environment, workerId, logger } = this.dependencies;
    const claims = await repository.claimOutboxBatch({
      workerId,
      limit: environment.WORKER_CLAIM_BATCH_SIZE,
      leaseSeconds: environment.WORKER_DATABASE_LEASE_SECONDS,
    });
    let enqueueFailed = false;

    for (const claim of claims) {
      try {
        await queues.enqueueOutbox({
          version: 1,
          tenantId: claim.tenantId,
          outboxEventId: claim.outboxEventId,
          claimToken: claim.claimToken,
          correlationId: this.correlationId(),
          idempotencyKey: `outbox/${claim.outboxEventId}/${claim.claimToken}`,
          requestedAt: this.now().toISOString(),
        });
      } catch (error) {
        enqueueFailed = true;
        logger.error(
          { queue: this.queue, ...safeErrorFields(error) },
          "Failed to enqueue claimed outbox event",
        );
        await failBestEffort(() =>
          repository.failOutbox({
            workerId,
            tenantId: claim.tenantId,
            outboxEventId: claim.outboxEventId,
            claimToken: claim.claimToken,
            errorCode: "QUEUE_ENQUEUE_FAILED",
            retryAt: new Date(this.now().getTime() + environment.WORKER_CLAIM_INTERVAL_MS),
          }),
        );
      }
    }
    if (enqueueFailed) {
      throw new PollBatchError("OUTBOX_QUEUE_ENQUEUE_FAILED");
    }
  }
}

class PollBatchError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PollBatchError";
    this.code = code;
  }
}

async function failBestEffort(operation: () => Promise<boolean>): Promise<void> {
  try {
    await operation();
  } catch {
    // The SQL lease is bounded and will make the row claimable again.
  }
}
