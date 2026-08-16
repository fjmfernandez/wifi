import type { PrismaClient } from "@wifi-entelsat/database";
import { z } from "zod";
import type {
  AccountingClaim,
  ClaimedOutboxRead,
  CheckpointResult,
  JobRepository,
  OutboxClaim,
} from "../handlers/job-repository.js";

const idSchema = z.string().uuid();
const timestampSchema = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));

const claimRowSchema = z.object({
  tenant_id: idSchema,
  event_id: idSchema,
  claim_token: idSchema,
  lease_expires_at: timestampSchema,
});

const outboxEventSchema = z.object({
  aggregateType: z.string().min(1).max(80),
  aggregateId: idSchema,
  eventType: z.string().min(3).max(120),
  eventVersion: z.number().int().positive(),
  payload: z.unknown(),
  occurredAt: z.iso.datetime({ offset: true }),
});

const checkpointRowSchema = z.object({
  result: z.enum(["completed", "already_applied", "claim_lost", "not_found"]),
});

const booleanRowSchema = z.object({ result: z.boolean() });
const claimedEventResponseSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("claimed"), event: outboxEventSchema }),
  z.object({ result: z.literal("already_applied") }),
  z.object({ result: z.literal("claim_lost") }),
  z.object({ result: z.literal("not_found") }),
]);
const claimedEventRowSchema = z.object({ response: claimedEventResponseSchema });

function checkpointResult(value: z.infer<typeof checkpointRowSchema>["result"]): CheckpointResult {
  switch (value) {
    case "completed":
      return "completed";
    case "already_applied":
      return "already-applied";
    case "claim_lost":
      return "claim-lost";
    case "not_found":
      return "not-found";
  }
}

export class PrismaJobRepository implements JobRepository {
  constructor(private readonly database: PrismaClient) {}

  async claimAccountingBatch(input: {
    readonly workerId: string;
    readonly limit: number;
    readonly leaseSeconds: number;
  }): Promise<readonly AccountingClaim[]> {
    const rows = await this.database.$queryRaw<unknown[]>`
      SELECT tenant_id, event_id, claim_token, lease_expires_at
      FROM radius_runtime.claim_accounting_events(
        ${input.workerId}::uuid,
        ${input.limit}::integer,
        ${input.leaseSeconds}::integer
      )
    `;
    return z
      .array(claimRowSchema)
      .parse(rows)
      .map((row) => ({
        tenantId: row.tenant_id,
        accountingInboxId: row.event_id,
        claimToken: row.claim_token,
        leaseExpiresAt: row.lease_expires_at,
      }));
  }

  async completeAccounting(input: {
    readonly workerId: string;
    readonly tenantId: string;
    readonly accountingInboxId: string;
    readonly claimToken: string;
  }): Promise<CheckpointResult> {
    const rows = await this.database.$queryRaw<unknown[]>`
      SELECT result
      FROM radius_runtime.complete_accounting_event(
        ${input.workerId}::uuid,
        ${input.tenantId}::uuid,
        ${input.accountingInboxId}::uuid,
        ${input.claimToken}::uuid
      )
    `;
    const row = checkpointRowSchema.parse(rows[0]);
    return checkpointResult(row.result);
  }

  async failAccounting(input: {
    readonly workerId: string;
    readonly tenantId: string;
    readonly accountingInboxId: string;
    readonly claimToken: string;
    readonly errorCode: string;
    readonly retryAt: Date;
  }): Promise<boolean> {
    const rows = await this.database.$queryRaw<unknown[]>`
      SELECT radius_runtime.fail_accounting_event(
        ${input.workerId}::uuid,
        ${input.tenantId}::uuid,
        ${input.accountingInboxId}::uuid,
        ${input.claimToken}::uuid,
        ${input.errorCode}::text,
        ${input.retryAt}::timestamptz
      ) AS result
    `;
    return booleanRowSchema.parse(rows[0]).result;
  }

  async claimOutboxBatch(input: {
    readonly workerId: string;
    readonly limit: number;
    readonly leaseSeconds: number;
  }): Promise<readonly OutboxClaim[]> {
    const rows = await this.database.$queryRaw<unknown[]>`
      SELECT tenant_id, event_id, claim_token, lease_expires_at
      FROM app.claim_outbox_events(
        ${input.workerId}::uuid,
        ${input.limit}::integer,
        ${input.leaseSeconds}::integer
      )
    `;
    return z
      .array(claimRowSchema)
      .parse(rows)
      .map((row) => ({
        tenantId: row.tenant_id,
        outboxEventId: row.event_id,
        claimToken: row.claim_token,
        leaseExpiresAt: row.lease_expires_at,
      }));
  }

  async readClaimedOutbox(input: {
    readonly workerId: string;
    readonly tenantId: string;
    readonly outboxEventId: string;
    readonly claimToken: string;
  }): Promise<ClaimedOutboxRead> {
    const rows = await this.database.$queryRaw<unknown[]>`
      SELECT app.read_claimed_outbox_event(
        ${input.workerId}::uuid,
        ${input.tenantId}::uuid,
        ${input.outboxEventId}::uuid,
        ${input.claimToken}::uuid
      ) AS response
    `;
    const response = claimedEventRowSchema.parse(rows[0]).response;
    if (response.result !== "claimed") {
      switch (response.result) {
        case "already_applied":
          return { status: "already-applied" };
        case "claim_lost":
          return { status: "claim-lost" };
        case "not_found":
          return { status: "not-found" };
      }
    }
    return {
      status: "claimed",
      event: {
        id: input.outboxEventId,
        tenantId: input.tenantId,
        aggregateType: response.event.aggregateType,
        aggregateId: response.event.aggregateId,
        eventType: response.event.eventType,
        eventVersion: response.event.eventVersion,
        payload: response.event.payload,
        occurredAt: response.event.occurredAt,
      },
    };
  }

  async completeOutbox(input: {
    readonly workerId: string;
    readonly tenantId: string;
    readonly outboxEventId: string;
    readonly claimToken: string;
  }): Promise<CheckpointResult> {
    const rows = await this.database.$queryRaw<unknown[]>`
      SELECT app.complete_outbox_event(
        ${input.workerId}::uuid,
        ${input.tenantId}::uuid,
        ${input.outboxEventId}::uuid,
        ${input.claimToken}::uuid
      ) AS result
    `;
    const row = checkpointRowSchema.parse(rows[0]);
    return checkpointResult(row.result);
  }

  async failOutbox(input: {
    readonly workerId: string;
    readonly tenantId: string;
    readonly outboxEventId: string;
    readonly claimToken: string;
    readonly errorCode: string;
    readonly retryAt: Date;
  }): Promise<boolean> {
    const rows = await this.database.$queryRaw<unknown[]>`
      SELECT app.fail_outbox_event(
        ${input.workerId}::uuid,
        ${input.tenantId}::uuid,
        ${input.outboxEventId}::uuid,
        ${input.claimToken}::uuid,
        ${input.errorCode}::text,
        ${input.retryAt}::timestamptz
      ) AS result
    `;
    return booleanRowSchema.parse(rows[0]).result;
  }
}

export class WorkerDatabaseDependency {
  constructor(private readonly database: PrismaClient) {}

  async ping(): Promise<boolean> {
    const rows = await this.database.$queryRaw<unknown[]>`
      SELECT current_role::text AS role, 1::integer AS probe
    `;
    const result = z
      .object({ role: z.literal("wifi_worker"), probe: z.literal(1) })
      .safeParse(rows[0]);
    return result.success;
  }

  async close(): Promise<void> {
    await this.database.$disconnect();
  }
}
