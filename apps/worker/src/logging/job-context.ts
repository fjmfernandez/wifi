import { AsyncLocalStorage } from "node:async_hooks";
import type { WorkerQueueKey } from "../queues/contracts.js";

export interface JobLogContext {
  readonly correlationId: string;
  readonly tenantId: string;
  readonly queue: WorkerQueueKey;
  readonly jobId: string;
}

const jobContextStorage = new AsyncLocalStorage<JobLogContext>();

export function currentJobContext(): JobLogContext | undefined {
  return jobContextStorage.getStore();
}

export function runWithJobContext<TResult>(
  context: JobLogContext,
  operation: () => Promise<TResult>,
): Promise<TResult> {
  return jobContextStorage.run(context, operation);
}
