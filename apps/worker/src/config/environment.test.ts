import { describe, expect, it } from "vitest";
import { parseEnvironment } from "./environment.js";

const DATABASE_URL = "postgresql://worker:secret@localhost:5432/wifi";

describe("parseEnvironment", () => {
  it("derives bounded concurrency and required queues", () => {
    const environment = parseEnvironment({
      NODE_ENV: "test",
      DATABASE_URL,
      REDIS_URL: "redis://localhost:6379/2",
      WORKER_REQUIRED_QUEUES: "accounting,exports",
      WORKER_ACCOUNTING_CONCURRENCY: "12",
    });

    expect(environment.requiredQueues).toEqual(["accounting", "exports"]);
    expect(environment.concurrency.accounting).toBe(12);
    expect(environment.WORKER_ATTEMPTS).toBe(8);
  });

  it("requires only the operational accounting handler by default", () => {
    const environment = parseEnvironment({
      DATABASE_URL,
      REDIS_URL: "redis://localhost:6379",
    });

    expect(environment.requiredQueues).toEqual(["accounting"]);
  });

  it("rejects unknown and duplicate queue names", () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL,
        REDIS_URL: "redis://localhost:6379",
        WORKER_REQUIRED_QUEUES: "outbox,unknown",
      }),
    ).toThrow("known queue names");

    expect(() =>
      parseEnvironment({
        DATABASE_URL,
        REDIS_URL: "redis://localhost:6379",
        WORKER_REQUIRED_QUEUES: "outbox,outbox",
      }),
    ).toThrow("must not contain duplicates");
  });

  it("requires Redis authentication in production", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://worker:secret@db.internal:5432/wifi",
        REDIS_URL: "rediss://redis.internal:6379",
      }),
    ).toThrow("authentication");

    expect(
      parseEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://worker:db-secret@db.internal:5432/wifi",
        REDIS_URL: "rediss://:secret@redis.internal:6379",
        BUILD_SHA: "0123456789abcdef",
      }).NODE_ENV,
    ).toBe("production");
  });

  it("keeps the processing deadline below the idempotency lease", () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL,
        REDIS_URL: "redis://localhost:6379",
        WORKER_PROCESSING_TIMEOUT_MS: "180000",
        WORKER_IDEMPOTENCY_LOCK_TTL_MS: "180000",
      }),
    ).toThrow("must be lower");
  });

  it("keeps the readiness freshness window above the claim interval", () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL,
        REDIS_URL: "redis://localhost:6379",
        WORKER_CLAIM_INTERVAL_MS: "5000",
        WORKER_POLLER_STALE_AFTER_MS: "5000",
      }),
    ).toThrow("must exceed the claim polling interval");
  });
});
