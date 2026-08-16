import type {
  AccountingJobData,
  DurableHandlerResult,
  DurableJobHandler,
  JobExecutionContext,
} from "../queues/contracts.js";
import { PermanentJobError, RetryableJobError } from "../processing/errors.js";
import type { JobRepository } from "./job-repository.js";

export class AccountingJobHandler implements DurableJobHandler<AccountingJobData> {
  constructor(
    private readonly repository: JobRepository,
    private readonly workerId: string,
  ) {}

  async handle(
    data: Readonly<AccountingJobData>,
    context: JobExecutionContext,
  ): Promise<DurableHandlerResult> {
    assertNotAborted(context.signal);
    try {
      const checkpoint = await this.repository.completeAccounting({
        workerId: this.workerId,
        tenantId: data.tenantId,
        accountingInboxId: data.accountingInboxId,
        claimToken: data.claimToken,
      });

      if (checkpoint === "completed") {
        return { status: "processed" };
      }
      if (checkpoint === "already-applied") {
        return { status: "already-applied" };
      }
      if (checkpoint === "not-found") {
        throw new PermanentJobError("ACCOUNTING_EVENT_NOT_FOUND");
      }
      throw new RetryableJobError("ACCOUNTING_CLAIM_LOST");
    } catch (error) {
      await failBestEffort(() =>
        this.repository.failAccounting({
          workerId: this.workerId,
          tenantId: data.tenantId,
          accountingInboxId: data.accountingInboxId,
          claimToken: data.claimToken,
          errorCode: failureCode(error),
          retryAt: new Date(Date.now() + retryDelayMs(context.attempt)),
        }),
      );
      throw error;
    }
  }
}

function retryDelayMs(attempt: number): number {
  return Math.min(1_000 * 2 ** Math.max(0, attempt - 1), 300_000);
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
  return "ACCOUNTING_RECONCILIATION_FAILED";
}

async function failBestEffort(operation: () => Promise<boolean>): Promise<void> {
  try {
    await operation();
  } catch {
    // The original error controls retry. A stale durable lease expires safely.
  }
}
