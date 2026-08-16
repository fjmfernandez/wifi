import { describe, expect, it } from "vitest";
import { evaluateReadiness } from "./readiness.js";

describe("evaluateReadiness", () => {
  it("fails closed when a required handler or consumer is missing", () => {
    const result = evaluateReadiness({
      stopping: false,
      redisReady: true,
      databaseReady: true,
      configuredQueues: new Set(["outbox"]),
      runningQueues: new Set(["outbox"]),
      readyClaimPollers: new Set(["outbox"]),
      requiredQueues: ["outbox", "accounting"],
    });

    expect(result.ready).toBe(false);
    expect(result.checks.handlers.missingQueues).toEqual(["accounting"]);
    expect(result.checks.consumers.missingQueues).toEqual(["accounting"]);
  });

  it("is ready only with Redis and every required consumer", () => {
    const base = {
      stopping: false,
      databaseReady: true,
      configuredQueues: new Set(["outbox", "accounting"] as const),
      runningQueues: new Set(["outbox", "accounting"] as const),
      readyClaimPollers: new Set(["outbox", "accounting"] as const),
      requiredQueues: ["outbox", "accounting"] as const,
    };

    expect(evaluateReadiness({ ...base, redisReady: true }).ready).toBe(true);
    expect(evaluateReadiness({ ...base, redisReady: false }).ready).toBe(false);
    expect(evaluateReadiness({ ...base, redisReady: true, databaseReady: false }).ready).toBe(
      false,
    );
    expect(evaluateReadiness({ ...base, redisReady: true, stopping: true }).ready).toBe(false);
    expect(
      evaluateReadiness({
        ...base,
        redisReady: true,
        readyClaimPollers: new Set(["outbox"] as const),
      }).ready,
    ).toBe(false);
  });
});
