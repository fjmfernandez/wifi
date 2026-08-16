import { UnrecoverableError, type Job } from "bullmq";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { parseEnvironment } from "../config/environment.js";
import {
  WORKER_JOB_NAMES,
  outboxJobDataSchema,
  type DurableHandlerResult,
  type OutboxJobData,
  type WorkerJobResult,
} from "../queues/contracts.js";
import { PermanentJobError } from "./errors.js";
import type { IdempotencyClaim, IdempotencyStore } from "./idempotency-store.js";
import { createIdempotentProcessor } from "./processor.js";

const validData: OutboxJobData = {
  version: 1,
  tenantId: "0198a123-4567-7abc-8def-0123456789ab",
  correlationId: "correlation-1234",
  idempotencyKey: "outbox/event-1234",
  requestedAt: "2026-08-16T12:00:00.000Z",
  outboxEventId: "0198a123-4567-7abc-8def-1123456789ab",
  claimToken: "0198a123-4567-7abc-8def-2123456789ab",
};

const environment = parseEnvironment({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://worker:secret@localhost:5432/wifi",
  REDIS_URL: "redis://localhost:6379",
});
const logger = pino({ enabled: false });

function fakeJob(data: OutboxJobData): Job<OutboxJobData, WorkerJobResult, "outbox.dispatch"> {
  return {
    id: "wifi-outbox-test",
    name: WORKER_JOB_NAMES.outbox,
    data,
    attemptsStarted: 1,
  } as Job<OutboxJobData, WorkerJobResult, "outbox.dispatch">;
}

function setup(claimResult: IdempotencyClaim = { state: "acquired", previouslyCompleted: false }) {
  const claim = vi.fn(async () => claimResult);
  const complete = vi.fn(async () => true);
  const release = vi.fn(async () => true);
  const store = { claim, complete, release } satisfies IdempotencyStore;
  const handle = vi.fn(async (): Promise<DurableHandlerResult> => ({ status: "processed" }));
  const handler = { handle };
  const processor = createIdempotentProcessor({
    queue: "outbox",
    jobName: WORKER_JOB_NAMES.outbox,
    schema: outboxJobDataSchema,
    handler,
    idempotencyStore: store,
    environment,
    logger,
    now: () => new Date("2026-08-16T12:01:00.000Z"),
    ownerToken: () => "owner-token",
  });
  return { processor, claim, complete, release, handle };
}

describe("createIdempotentProcessor", () => {
  it("fails an invalid tenant payload permanently without claiming or handling it", async () => {
    const state = setup();
    const invalidData = { ...validData, tenantId: undefined } as unknown as OutboxJobData;

    await expect(state.processor(fakeJob(invalidData))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(state.claim).not.toHaveBeenCalled();
    expect(state.handle).not.toHaveBeenCalled();
    expect(state.complete).not.toHaveBeenCalled();
  });

  it("never trusts a Redis completion marker without durable verification", async () => {
    const state = setup({ state: "acquired", previouslyCompleted: true });
    state.handle.mockResolvedValueOnce({ status: "already-applied" });

    await expect(state.processor(fakeJob(validData))).resolves.toEqual({
      status: "already-applied",
      completedAt: "2026-08-16T12:01:00.000Z",
    });
    expect(state.handle).toHaveBeenCalledOnce();
    expect(state.complete).toHaveBeenCalledOnce();
  });

  it("completes only after the durable handler succeeds", async () => {
    const state = setup();

    await expect(state.processor(fakeJob(validData))).resolves.toEqual({
      status: "processed",
      completedAt: "2026-08-16T12:01:00.000Z",
    });
    expect(state.handle).toHaveBeenCalledOnce();
    expect(state.complete).toHaveBeenCalledOnce();
    expect(state.release).not.toHaveBeenCalled();
    expect(state.complete.mock.invocationCallOrder[0]).toBeGreaterThan(
      state.handle.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("releases the lease and returns a retryable safe error on transient failure", async () => {
    const state = setup();
    state.handle.mockRejectedValueOnce(new Error("sensitive upstream detail"));

    await expect(state.processor(fakeJob(validData))).rejects.toThrow("JOB_HANDLER_FAILED");
    expect(state.release).toHaveBeenCalledOnce();
    expect(state.complete).not.toHaveBeenCalled();
  });

  it("maps a permanent domain rejection to BullMQ UnrecoverableError", async () => {
    const state = setup();
    state.handle.mockRejectedValueOnce(new PermanentJobError("EXPORT_APPROVAL_INVALID"));

    await expect(state.processor(fakeJob(validData))).rejects.toMatchObject({
      name: "UnrecoverableError",
      message: "EXPORT_APPROVAL_INVALID",
    });
    expect(state.release).toHaveBeenCalledOnce();
  });

  it("rejects conflicting reuse of an idempotency key permanently", async () => {
    const state = setup({ state: "conflict" });

    await expect(state.processor(fakeJob(validData))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(state.handle).not.toHaveBeenCalled();
    expect(state.complete).not.toHaveBeenCalled();
  });
});
