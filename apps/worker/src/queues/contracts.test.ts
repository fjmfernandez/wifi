import { describe, expect, it } from "vitest";
import {
  accountingJobDataSchema,
  outboxJobDataSchema,
  retentionJobDataSchema,
} from "./contracts.js";
import { createStableJobId } from "./queue-client.js";

const baseJob = {
  version: 1,
  tenantId: "0198a123-4567-7abc-8def-0123456789ab",
  correlationId: "correlation-1234",
  idempotencyKey: "operation/request-1234",
  requestedAt: "2026-08-16T12:00:00.000Z",
} as const;

describe("worker queue contracts", () => {
  it("requires a valid tenant on every job", () => {
    const withoutTenant = {
      version: 1,
      correlationId: baseJob.correlationId,
      idempotencyKey: baseJob.idempotencyKey,
      requestedAt: baseJob.requestedAt,
      accountingInboxId: "0198a123-4567-7abc-8def-1123456789ab",
      claimToken: "0198a123-4567-7abc-8def-2123456789ab",
    };

    expect(accountingJobDataSchema.safeParse(withoutTenant).success).toBe(false);
  });

  it("rejects unexpected payload fields so jobs remain reference-only", () => {
    const result = outboxJobDataSchema.safeParse({
      ...baseJob,
      outboxEventId: "0198a123-4567-7abc-8def-1123456789ab",
      claimToken: "0198a123-4567-7abc-8def-2123456789ab",
      email: "pii@example.test",
    });

    expect(result.success).toBe(false);
  });

  it("requires approval evidence for destructive retention mode", () => {
    const run = {
      ...baseJob,
      retentionRunId: "0198a123-4567-7abc-8def-2123456789ab",
      mode: "apply",
      policySnapshotHash: "a".repeat(64),
    };

    expect(retentionJobDataSchema.safeParse(run).success).toBe(false);
    expect(
      retentionJobDataSchema.safeParse({ ...run, approvalReference: "approval-1234" }).success,
    ).toBe(true);
  });

  it("creates deterministic BullMQ-safe job IDs", () => {
    const first = createStableJobId("outbox", "operation/request-1234");
    const second = createStableJobId("outbox", "operation/request-1234");
    const other = createStableJobId("accounting", "operation/request-1234");

    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).not.toContain(":");
    expect(first).toMatch(/^wifi-outbox-[0-9a-f]{40}$/);
  });
});
