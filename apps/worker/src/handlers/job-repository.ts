export type CheckpointResult = "completed" | "already-applied" | "claim-lost" | "not-found";

export interface AccountingClaim {
  readonly tenantId: string;
  readonly accountingInboxId: string;
  readonly claimToken: string;
  readonly leaseExpiresAt: string;
}

export interface OutboxEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly payload: unknown;
  readonly occurredAt: string;
}

export type ClaimedOutboxRead =
  | { readonly status: "claimed"; readonly event: OutboxEvent }
  | { readonly status: "already-applied" | "claim-lost" | "not-found" };

export interface OutboxClaim {
  readonly tenantId: string;
  readonly outboxEventId: string;
  readonly claimToken: string;
  readonly leaseExpiresAt: string;
}

export interface JobRepository {
  claimAccountingBatch(input: {
    readonly workerId: string;
    readonly limit: number;
    readonly leaseSeconds: number;
  }): Promise<readonly AccountingClaim[]>;
  completeAccounting(input: {
    readonly workerId: string;
    readonly tenantId: string;
    readonly accountingInboxId: string;
    readonly claimToken: string;
  }): Promise<CheckpointResult>;
  failAccounting(input: {
    readonly workerId: string;
    readonly tenantId: string;
    readonly accountingInboxId: string;
    readonly claimToken: string;
    readonly errorCode: string;
    readonly retryAt: Date;
  }): Promise<boolean>;
  claimOutboxBatch(input: {
    readonly workerId: string;
    readonly limit: number;
    readonly leaseSeconds: number;
  }): Promise<readonly OutboxClaim[]>;
  readClaimedOutbox(input: {
    readonly workerId: string;
    readonly tenantId: string;
    readonly outboxEventId: string;
    readonly claimToken: string;
  }): Promise<ClaimedOutboxRead>;
  completeOutbox(input: {
    readonly workerId: string;
    readonly tenantId: string;
    readonly outboxEventId: string;
    readonly claimToken: string;
  }): Promise<CheckpointResult>;
  failOutbox(input: {
    readonly workerId: string;
    readonly tenantId: string;
    readonly outboxEventId: string;
    readonly claimToken: string;
    readonly errorCode: string;
    readonly retryAt: Date;
  }): Promise<boolean>;
}
