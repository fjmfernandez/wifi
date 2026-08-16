import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { AgentIdentityMaterial } from "../contracts.js";
import { RuntimeState } from "../runtime/runtime-state.js";
import { CryptoVault } from "../security/crypto-vault.js";
import { SqliteStore } from "../storage/sqlite-store.js";
import { ReadinessService } from "./readiness.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("site-agent readiness", () => {
  it("requires durable identity, active runtime and recent cloud contact", () => {
    const directory = mkdtempSync(join(tmpdir(), "wifi-agent-health-"));
    directories.push(directory);
    const store = new SqliteStore(
      join(directory, "agent.sqlite"),
      new CryptoVault(randomBytes(32)),
    );
    const now = () => new Date("2026-08-16T10:00:00.000Z");
    const state = new RuntimeState();
    const readiness = new ReadinessService(
      { readinessMaxCloudStalenessMs: 120_000 },
      store,
      state,
      now,
    );
    expect(readiness.check().ready).toBe(false);

    const identity: AgentIdentityMaterial = {
      protocolVersion: 1,
      identityId: "0198a000-0000-7000-8000-000000000011",
      tenantId: "0198a000-0000-7000-8000-000000000001",
      gatewayId: "0198a000-0000-7000-8000-000000000021",
      certificatePem: `-----BEGIN CERTIFICATE-----\n${"A".repeat(80)}\n-----END CERTIFICATE-----`,
      caCertificatePem: `-----BEGIN CERTIFICATE-----\n${"B".repeat(80)}\n-----END CERTIFICATE-----`,
      certificateNotAfter: "2027-08-16T10:00:00.000Z",
      initialCommandSequence: 0,
      privateKeyPem: `-----BEGIN PRIVATE KEY-----\n${"C".repeat(80)}\n-----END PRIVATE KEY-----`,
      enrolledAt: "2026-08-16T09:59:00.000Z",
    };
    store.saveIdentity(identity);
    state.markStarted();
    state.markCloudSuccess(now());
    const result = readiness.check();
    expect(result.ready).toBe(true);
    expect(result.checks.apply).toEqual({
      ok: false,
      status: "BLOCKED_BY_LAB_VALIDATION",
    });
    store.close();
  });
});
