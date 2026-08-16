import type { WorkerQueueKey } from "../queues/contracts.js";

export interface ReadinessSnapshot {
  readonly stopping: boolean;
  readonly redisReady: boolean;
  readonly databaseReady: boolean;
  readonly configuredQueues: ReadonlySet<WorkerQueueKey>;
  readonly runningQueues: ReadonlySet<WorkerQueueKey>;
  readonly readyClaimPollers: ReadonlySet<WorkerQueueKey>;
  readonly requiredQueues: readonly WorkerQueueKey[];
}

export interface ReadinessResult {
  readonly ready: boolean;
  readonly checks: {
    readonly runtime: { readonly ok: boolean };
    readonly redis: { readonly ok: boolean };
    readonly database: { readonly ok: boolean };
    readonly handlers: {
      readonly ok: boolean;
      readonly missingQueues: readonly WorkerQueueKey[];
    };
    readonly consumers: {
      readonly ok: boolean;
      readonly missingQueues: readonly WorkerQueueKey[];
    };
    readonly claimPollers: {
      readonly ok: boolean;
      readonly missingQueues: readonly WorkerQueueKey[];
    };
  };
}

export function evaluateReadiness(snapshot: ReadinessSnapshot): ReadinessResult {
  const missingHandlers = snapshot.requiredQueues.filter(
    (queue) => !snapshot.configuredQueues.has(queue),
  );
  const missingConsumers = snapshot.requiredQueues.filter(
    (queue) => !snapshot.runningQueues.has(queue),
  );
  const missingClaimPollers = snapshot.requiredQueues.filter(
    (queue) =>
      (queue === "accounting" || queue === "outbox") && !snapshot.readyClaimPollers.has(queue),
  );
  const checks = {
    runtime: { ok: !snapshot.stopping },
    redis: { ok: snapshot.redisReady },
    database: { ok: snapshot.databaseReady },
    handlers: { ok: missingHandlers.length === 0, missingQueues: missingHandlers },
    consumers: { ok: missingConsumers.length === 0, missingQueues: missingConsumers },
    claimPollers: { ok: missingClaimPollers.length === 0, missingQueues: missingClaimPollers },
  } as const;

  return {
    ready:
      checks.runtime.ok &&
      checks.redis.ok &&
      checks.database.ok &&
      checks.handlers.ok &&
      checks.consumers.ok &&
      checks.claimPollers.ok,
    checks,
  };
}
