import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { parseEnvironment } from "../config/environment.js";
import type {
  CheckpointResult,
  ClaimedOutboxRead,
  JobRepository,
  OutboxClaim,
} from "../handlers/job-repository.js";
import { AccountingClaimPoller, OutboxClaimPoller } from "./claim-poller.js";

const tenantId = "0198a123-4567-7abc-8def-0123456789ab";
const accountingInboxId = "0198a123-4567-7abc-8def-1123456789ab";
const outboxEventId = "0198a123-4567-7abc-8def-5123456789ab";
const claimToken = "0198a123-4567-7abc-8def-2123456789ab";
const workerId = "0198a123-4567-7abc-8def-3123456789ab";
const now = new Date("2026-08-16T12:00:00.000Z");
const environment = parseEnvironment({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://worker:secret@localhost:5432/wifi",
  REDIS_URL: "redis://localhost:6379",
});

function createRepository() {
  const claimAccountingBatch = vi.fn(async () => [
    {
      tenantId,
      accountingInboxId,
      claimToken,
      leaseExpiresAt: "2026-08-16T12:05:00.000Z",
    },
  ]);
  const completeAccounting = vi.fn(async (): Promise<CheckpointResult> => "completed");
  const failAccounting = vi.fn(async () => true);
  const claimOutboxBatch = vi.fn(async (): Promise<readonly OutboxClaim[]> => []);
  const readClaimedOutbox = vi.fn(async (): Promise<ClaimedOutboxRead> => ({
    status: "not-found",
  }));
  const completeOutbox = vi.fn(async (): Promise<CheckpointResult> => "completed");
  const failOutbox = vi.fn(async () => true);
  const repository = {
    claimAccountingBatch,
    completeAccounting,
    failAccounting,
    claimOutboxBatch,
    readClaimedOutbox,
    completeOutbox,
    failOutbox,
  } satisfies JobRepository;
  return {
    repository,
    claimAccountingBatch,
    failAccounting,
    claimOutboxBatch,
    failOutbox,
  };
}

describe("AccountingClaimPoller", () => {
  it("moves a bounded SQL claim to a reference-only BullMQ job", async () => {
    const state = createRepository();
    const enqueueAccounting = vi.fn(async () => "job-id");
    const poller = new AccountingClaimPoller({
      repository: state.repository,
      queues: { enqueueAccounting, enqueueOutbox: vi.fn(async () => "job-id") },
      environment,
      workerId,
      logger: pino({ enabled: false }),
      now: () => now,
      correlationId: () => "correlation-1234",
    });

    poller.start();
    await poller.pollNow();

    expect(state.claimAccountingBatch).toHaveBeenCalledWith({
      workerId,
      limit: 32,
      leaseSeconds: 300,
    });
    expect(enqueueAccounting).toHaveBeenCalledWith({
      version: 1,
      tenantId,
      accountingInboxId,
      claimToken,
      correlationId: "correlation-1234",
      idempotencyKey: `accounting/${accountingInboxId}/${claimToken}`,
      requestedAt: now.toISOString(),
    });
    expect(poller.isReady()).toBe(true);
    await poller.stop();
  });

  it("releases the SQL claim when queue publication fails", async () => {
    const state = createRepository();
    const poller = new AccountingClaimPoller({
      repository: state.repository,
      queues: {
        enqueueAccounting: vi.fn(async () => {
          throw new Error("Redis unavailable");
        }),
        enqueueOutbox: vi.fn(async () => "job-id"),
      },
      environment,
      workerId,
      logger: pino({ enabled: false }),
      now: () => now,
      correlationId: () => "correlation-1234",
    });

    await poller.pollNow();

    expect(state.failAccounting).toHaveBeenCalledWith({
      workerId,
      tenantId,
      accountingInboxId,
      claimToken,
      errorCode: "QUEUE_ENQUEUE_FAILED",
      retryAt: new Date(now.getTime() + environment.WORKER_CLAIM_INTERVAL_MS),
    });
    expect(poller.isReady()).toBe(false);
  });

  it("does not overlap database claims", async () => {
    const state = createRepository();
    let releaseClaim: (() => void) | undefined;
    state.claimAccountingBatch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseClaim = () => resolve([]);
        }),
    );
    const poller = new AccountingClaimPoller({
      repository: state.repository,
      queues: {
        enqueueAccounting: vi.fn(async () => "job-id"),
        enqueueOutbox: vi.fn(async () => "job-id"),
      },
      environment,
      workerId,
      logger: pino({ enabled: false }),
    });

    const first = poller.pollNow();
    const second = poller.pollNow();
    expect(state.claimAccountingBatch).toHaveBeenCalledOnce();
    releaseClaim?.();
    await Promise.all([first, second]);
  });
});

describe("OutboxClaimPoller", () => {
  it("enqueues only a claimed event reference and its CAS token", async () => {
    const state = createRepository();
    state.claimOutboxBatch.mockResolvedValueOnce([
      {
        tenantId,
        outboxEventId,
        claimToken,
        leaseExpiresAt: "2026-08-16T12:05:00.000Z",
      },
    ]);
    const enqueueOutbox = vi.fn(async () => "job-id");
    const poller = new OutboxClaimPoller({
      repository: state.repository,
      queues: { enqueueAccounting: vi.fn(async () => "job-id"), enqueueOutbox },
      environment,
      workerId,
      logger: pino({ enabled: false }),
      now: () => now,
      correlationId: () => "correlation-5678",
    });

    await poller.pollNow();

    expect(enqueueOutbox).toHaveBeenCalledWith({
      version: 1,
      tenantId,
      outboxEventId,
      claimToken,
      correlationId: "correlation-5678",
      idempotencyKey: `outbox/${outboxEventId}/${claimToken}`,
      requestedAt: now.toISOString(),
    });
  });

  it("returns a failed queue publication to the durable SQL retry schedule", async () => {
    const state = createRepository();
    state.claimOutboxBatch.mockResolvedValueOnce([
      {
        tenantId,
        outboxEventId,
        claimToken,
        leaseExpiresAt: "2026-08-16T12:05:00.000Z",
      },
    ]);
    const poller = new OutboxClaimPoller({
      repository: state.repository,
      queues: {
        enqueueAccounting: vi.fn(async () => "job-id"),
        enqueueOutbox: vi.fn(async () => {
          throw new Error("Redis unavailable");
        }),
      },
      environment,
      workerId,
      logger: pino({ enabled: false }),
      now: () => now,
    });

    await poller.pollNow();

    expect(state.failOutbox).toHaveBeenCalledWith({
      workerId,
      tenantId,
      outboxEventId,
      claimToken,
      errorCode: "QUEUE_ENQUEUE_FAILED",
      retryAt: new Date(now.getTime() + environment.WORKER_CLAIM_INTERVAL_MS),
    });
    expect(poller.isReady()).toBe(false);
  });
});
