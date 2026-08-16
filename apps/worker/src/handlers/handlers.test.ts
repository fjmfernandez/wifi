import { describe, expect, it, vi } from "vitest";
import type { AccountingJobData, JobExecutionContext, OutboxJobData } from "../queues/contracts.js";
import { AccountingJobHandler } from "./accounting-handler.js";
import type {
  CheckpointResult,
  ClaimedOutboxRead,
  JobRepository,
  OutboxEvent,
} from "./job-repository.js";
import { OutboxJobHandler } from "./outbox-handler.js";

const tenantId = "0198a123-4567-7abc-8def-0123456789ab";
const accountingInboxId = "0198a123-4567-7abc-8def-1123456789ab";
const outboxEventId = "0198a123-4567-7abc-8def-2123456789ab";
const workerId = "0198a123-4567-7abc-8def-3123456789ab";
const claimToken = "0198a123-4567-7abc-8def-4123456789ab";

const context: JobExecutionContext = {
  queue: "accounting",
  jobId: "job-1",
  attempt: 1,
  deadlineAt: new Date("2026-08-16T12:05:00.000Z"),
  signal: new AbortController().signal,
};

const accountingJob: AccountingJobData = {
  version: 1,
  tenantId,
  correlationId: "correlation-1234",
  idempotencyKey: `accounting/${accountingInboxId}/${claimToken}`,
  requestedAt: "2026-08-16T12:00:00.000Z",
  accountingInboxId,
  claimToken,
};

const outboxJob: OutboxJobData = {
  version: 1,
  tenantId,
  correlationId: "correlation-5678",
  idempotencyKey: `outbox/${outboxEventId}/${claimToken}`,
  requestedAt: "2026-08-16T12:00:00.000Z",
  outboxEventId,
  claimToken,
};

const outboxEvent: OutboxEvent = {
  id: outboxEventId,
  tenantId,
  aggregateType: "site",
  aggregateId: "0198a123-4567-7abc-8def-5123456789ab",
  eventType: "site.updated",
  eventVersion: 1,
  payload: { redacted: true },
  occurredAt: "2026-08-16T12:00:00.000Z",
};

function createRepository() {
  const claimAccountingBatch = vi.fn(async () => []);
  const completeAccounting = vi.fn(async (): Promise<CheckpointResult> => "completed");
  const failAccounting = vi.fn(async () => true);
  const claimOutboxBatch = vi.fn(async () => []);
  const readClaimedOutbox = vi.fn(async (): Promise<ClaimedOutboxRead> => ({
    status: "claimed",
    event: outboxEvent,
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
    completeAccounting,
    failAccounting,
    readClaimedOutbox,
    completeOutbox,
    failOutbox,
  };
}

describe("AccountingJobHandler", () => {
  it("reconciles only the exact durable SQL claim transported by the job", async () => {
    const state = createRepository();
    const handler = new AccountingJobHandler(state.repository, workerId);

    await expect(handler.handle(accountingJob, context)).resolves.toEqual({
      status: "processed",
    });
    expect(state.completeAccounting).toHaveBeenCalledWith({
      workerId,
      tenantId,
      accountingInboxId,
      claimToken,
    });
    expect(state.failAccounting).not.toHaveBeenCalled();
  });

  it("returns already-applied after durable verification", async () => {
    const state = createRepository();
    state.completeAccounting.mockResolvedValueOnce("already-applied");
    const handler = new AccountingJobHandler(state.repository, workerId);

    await expect(handler.handle(accountingJob, context)).resolves.toEqual({
      status: "already-applied",
    });
  });

  it("retries a lost claim and records only a machine-safe failure", async () => {
    const state = createRepository();
    state.completeAccounting.mockResolvedValueOnce("claim-lost");
    const handler = new AccountingJobHandler(state.repository, workerId);

    await expect(handler.handle(accountingJob, context)).rejects.toMatchObject({
      code: "ACCOUNTING_CLAIM_LOST",
    });
    expect(state.failAccounting).toHaveBeenCalledWith({
      workerId,
      tenantId,
      accountingInboxId,
      claimToken,
      errorCode: "ACCOUNTING_CLAIM_LOST",
      retryAt: expect.any(Date),
    });
  });

  it("does not persist raw database errors", async () => {
    const state = createRepository();
    state.completeAccounting.mockRejectedValueOnce(new Error("row data must not persist"));
    const handler = new AccountingJobHandler(state.repository, workerId);

    await expect(handler.handle(accountingJob, context)).rejects.toThrow("row data");
    expect(state.failAccounting).toHaveBeenCalledWith({
      workerId,
      tenantId,
      accountingInboxId,
      claimToken,
      errorCode: "ACCOUNTING_RECONCILIATION_FAILED",
      retryAt: expect.any(Date),
    });
  });
});

describe("OutboxJobHandler", () => {
  it("publishes a rehydrated claimed event before completing its SQL checkpoint", async () => {
    const state = createRepository();
    const publish = vi.fn(async () => undefined);
    const handler = new OutboxJobHandler(state.repository, { publish }, workerId);

    await expect(handler.handle(outboxJob, { ...context, queue: "outbox" })).resolves.toEqual({
      status: "processed",
    });
    expect(state.readClaimedOutbox).toHaveBeenCalledWith({
      workerId,
      tenantId,
      outboxEventId,
      claimToken,
    });
    expect(publish).toHaveBeenCalledWith(outboxEvent, expect.any(Object));
    expect(state.completeOutbox.mock.invocationCallOrder[0]).toBeGreaterThan(
      publish.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("never checkpoints an event when its real publisher fails", async () => {
    const state = createRepository();
    const publish = vi.fn(async () => {
      throw new Error("destination unavailable");
    });
    const handler = new OutboxJobHandler(state.repository, { publish }, workerId);

    await expect(handler.handle(outboxJob, { ...context, queue: "outbox" })).rejects.toThrow(
      "destination unavailable",
    );
    expect(state.completeOutbox).not.toHaveBeenCalled();
    expect(state.failOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId,
        tenantId,
        outboxEventId,
        claimToken,
        errorCode: "OUTBOX_PUBLISH_FAILED",
      }),
    );
  });

  it("does not publish or checkpoint when the durable claim was lost", async () => {
    const state = createRepository();
    state.readClaimedOutbox.mockResolvedValueOnce({ status: "claim-lost" });
    const publish = vi.fn(async () => undefined);
    const handler = new OutboxJobHandler(state.repository, { publish }, workerId);

    await expect(handler.handle(outboxJob, { ...context, queue: "outbox" })).rejects.toMatchObject({
      code: "OUTBOX_CLAIM_LOST",
    });
    expect(publish).not.toHaveBeenCalled();
    expect(state.completeOutbox).not.toHaveBeenCalled();
    expect(state.failOutbox).not.toHaveBeenCalled();
  });

  it("accepts already-applied only after the SQL read proves it", async () => {
    const state = createRepository();
    state.readClaimedOutbox.mockResolvedValueOnce({ status: "already-applied" });
    const publish = vi.fn(async () => undefined);
    const handler = new OutboxJobHandler(state.repository, { publish }, workerId);

    await expect(handler.handle(outboxJob, { ...context, queue: "outbox" })).resolves.toEqual({
      status: "already-applied",
    });
    expect(publish).not.toHaveBeenCalled();
    expect(state.completeOutbox).not.toHaveBeenCalled();
  });
});
