import { createHash } from "node:crypto";
import type { WorkerRedisClient } from "../redis/client.js";
import type { WorkerQueueKey } from "../queues/contracts.js";

export interface IdempotencyScope {
  readonly queue: WorkerQueueKey;
  readonly tenantId: string;
  readonly idempotencyKey: string;
}

export type IdempotencyClaim =
  | { readonly state: "acquired"; readonly previouslyCompleted: boolean }
  | { readonly state: "busy" }
  | { readonly state: "conflict" };

export interface IdempotencyStore {
  claim(
    scope: IdempotencyScope,
    fingerprint: string,
    ownerToken: string,
    ttlMs: number,
  ): Promise<IdempotencyClaim>;
  complete(
    scope: IdempotencyScope,
    fingerprint: string,
    ownerToken: string,
    resultTtlSeconds: number,
  ): Promise<boolean>;
  release(scope: IdempotencyScope, ownerToken: string): Promise<boolean>;
}

const CLAIM_SCRIPT = `
local completed = redis.call('GET', KEYS[2])
if completed then
  if completed ~= ARGV[2] then return 3 end
end
local active = redis.call('GET', KEYS[1])
if active then
  local separator = string.find(active, '|', 1, true)
  local activeFingerprint = separator and string.sub(active, separator + 1) or ''
  if activeFingerprint ~= ARGV[2] then return 3 else return 0 end
end
local lockValue = ARGV[1] .. '|' .. ARGV[2]
local acquired = redis.call('SET', KEYS[1], lockValue, 'PX', ARGV[3], 'NX')
if acquired then
  if completed then return 4 else return 1 end
else
  return 0
end
`;

const COMPLETE_SCRIPT = `
local lockValue = redis.call('GET', KEYS[1])
local expected = ARGV[1] .. '|' .. ARGV[2]
if lockValue ~= expected then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
redis.call('DEL', KEYS[1])
return 1
`;

const RELEASE_SCRIPT = `
local lockValue = redis.call('GET', KEYS[1])
if not lockValue then return 1 end
local separator = string.find(lockValue, '|', 1, true)
local activeOwner = separator and string.sub(lockValue, 1, separator - 1) or ''
if activeOwner ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;

export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly redis: WorkerRedisClient,
    private readonly keyPrefix: string,
  ) {}

  async claim(
    scope: IdempotencyScope,
    fingerprint: string,
    ownerToken: string,
    ttlMs: number,
  ): Promise<IdempotencyClaim> {
    const [lockKey, resultKey] = this.keys(scope);
    const result = await this.redis.eval(CLAIM_SCRIPT, {
      keys: [lockKey, resultKey],
      arguments: [ownerToken, fingerprint, String(ttlMs)],
    });

    switch (Number(result)) {
      case 1:
        return { state: "acquired", previouslyCompleted: false };
      case 4:
        return { state: "acquired", previouslyCompleted: true };
      case 3:
        return { state: "conflict" };
      default:
        return { state: "busy" };
    }
  }

  async complete(
    scope: IdempotencyScope,
    fingerprint: string,
    ownerToken: string,
    resultTtlSeconds: number,
  ): Promise<boolean> {
    const [lockKey, resultKey] = this.keys(scope);
    const result = await this.redis.eval(COMPLETE_SCRIPT, {
      keys: [lockKey, resultKey],
      arguments: [ownerToken, fingerprint, String(resultTtlSeconds)],
    });
    return Number(result) === 1;
  }

  async release(scope: IdempotencyScope, ownerToken: string): Promise<boolean> {
    const [lockKey] = this.keys(scope);
    const result = await this.redis.eval(RELEASE_SCRIPT, {
      keys: [lockKey],
      arguments: [ownerToken],
    });
    return Number(result) === 1;
  }

  private keys(scope: IdempotencyScope): readonly [string, string] {
    const digest = createHash("sha256")
      .update(`${scope.queue}\u0000${scope.tenantId}\u0000${scope.idempotencyKey}`)
      .digest("hex");
    const baseKey = `${this.keyPrefix}:worker:idempotency:${digest}`;
    return [`${baseKey}:lock`, `${baseKey}:done`];
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !["correlationId", "idempotencyKey", "requestedAt"].includes(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function operationFingerprint(queue: WorkerQueueKey, data: object): string {
  return createHash("sha256")
    .update(JSON.stringify({ queue, data: canonicalize(data) }))
    .digest("hex");
}
