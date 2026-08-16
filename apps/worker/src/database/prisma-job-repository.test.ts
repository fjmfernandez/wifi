import { describe, expect, it, vi } from "vitest";
import { PrismaJobRepository, WorkerDatabaseDependency } from "./prisma-job-repository.js";

const workerId = "0198a123-4567-7abc-8def-0123456789ab";
const tenantId = "0198a123-4567-7abc-8def-1123456789ab";
const eventId = "0198a123-4567-7abc-8def-2123456789ab";
const claimToken = "0198a123-4567-7abc-8def-3123456789ab";
const aggregateId = "0198a123-4567-7abc-8def-4123456789ab";

function createDatabase() {
  const queryRaw = vi.fn();
  const disconnect = vi.fn(async () => undefined);
  const database = {
    $queryRaw: queryRaw,
    $disconnect: disconnect,
  } as unknown as ConstructorParameters<typeof PrismaJobRepository>[0];
  return { database, queryRaw, disconnect };
}

describe("PrismaJobRepository", () => {
  it("maps bounded accounting claims without transporting the event payload", async () => {
    const state = createDatabase();
    state.queryRaw.mockResolvedValueOnce([
      {
        tenant_id: tenantId,
        event_id: eventId,
        claim_token: claimToken,
        lease_expires_at: new Date("2026-08-16T12:05:00.000Z"),
      },
    ]);
    const repository = new PrismaJobRepository(state.database);

    await expect(
      repository.claimAccountingBatch({ workerId, limit: 32, leaseSeconds: 300 }),
    ).resolves.toEqual([
      {
        tenantId,
        accountingInboxId: eventId,
        claimToken,
        leaseExpiresAt: "2026-08-16T12:05:00.000Z",
      },
    ]);
    expect(state.queryRaw.mock.calls[0]?.slice(1)).toEqual([workerId, 32, 300]);
  });

  it("passes a durable retry timestamp when releasing an accounting claim", async () => {
    const state = createDatabase();
    state.queryRaw.mockResolvedValueOnce([{ result: true }]);
    const repository = new PrismaJobRepository(state.database);
    const retryAt = new Date("2026-08-16T12:01:00.000Z");

    await expect(
      repository.failAccounting({
        workerId,
        tenantId,
        accountingInboxId: eventId,
        claimToken,
        errorCode: "QUEUE_ENQUEUE_FAILED",
        retryAt,
      }),
    ).resolves.toBe(true);
    expect(state.queryRaw.mock.calls[0]?.slice(1)).toEqual([
      workerId,
      tenantId,
      eventId,
      claimToken,
      "QUEUE_ENQUEUE_FAILED",
      retryAt,
    ]);
  });

  it("rehydrates only an explicitly claimed outbox event", async () => {
    const state = createDatabase();
    state.queryRaw.mockResolvedValueOnce([
      {
        response: {
          result: "claimed",
          event: {
            aggregateType: "site",
            aggregateId,
            eventType: "site.updated",
            eventVersion: 2,
            payload: { safe: true },
            occurredAt: "2026-08-16T12:00:00.000Z",
            attempt: 1,
            leaseExpiresAt: "2026-08-16T12:05:00.000Z",
          },
        },
      },
    ]);
    const repository = new PrismaJobRepository(state.database);

    await expect(
      repository.readClaimedOutbox({ workerId, tenantId, outboxEventId: eventId, claimToken }),
    ).resolves.toEqual({
      status: "claimed",
      event: {
        id: eventId,
        tenantId,
        aggregateType: "site",
        aggregateId,
        eventType: "site.updated",
        eventVersion: 2,
        payload: { safe: true },
        occurredAt: "2026-08-16T12:00:00.000Z",
      },
    });
  });

  it.each([
    ["already_applied", "already-applied"],
    ["claim_lost", "claim-lost"],
    ["not_found", "not-found"],
  ] as const)("maps outbox read status %s without inventing an event", async (result, status) => {
    const state = createDatabase();
    state.queryRaw.mockResolvedValueOnce([{ response: { result } }]);
    const repository = new PrismaJobRepository(state.database);

    await expect(
      repository.readClaimedOutbox({ workerId, tenantId, outboxEventId: eventId, claimToken }),
    ).resolves.toEqual({ status });
  });

  it("rejects malformed SQL boundary data instead of acknowledging it", async () => {
    const state = createDatabase();
    state.queryRaw.mockResolvedValueOnce([
      {
        tenant_id: tenantId,
        event_id: eventId,
        claim_token: "not-a-token",
        lease_expires_at: new Date("2026-08-16T12:05:00.000Z"),
      },
    ]);
    const repository = new PrismaJobRepository(state.database);

    await expect(
      repository.claimAccountingBatch({ workerId, limit: 32, leaseSeconds: 300 }),
    ).rejects.toThrow();
  });
});

describe("WorkerDatabaseDependency", () => {
  it("is ready only when every pooled connection assumes wifi_worker", async () => {
    const state = createDatabase();
    const dependency = new WorkerDatabaseDependency(state.database);
    state.queryRaw.mockResolvedValueOnce([{ role: "wifi_jobs", probe: 1 }]);
    await expect(dependency.ping()).resolves.toBe(false);

    state.queryRaw.mockResolvedValueOnce([{ role: "wifi_worker", probe: 1 }]);
    await expect(dependency.ping()).resolves.toBe(true);
  });

  it("disconnects the database pool during shutdown", async () => {
    const state = createDatabase();
    const dependency = new WorkerDatabaseDependency(state.database);

    await dependency.close();
    expect(state.disconnect).toHaveBeenCalledOnce();
  });
});
