import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { InMemoryMockCloud } from "../cloud/mock-cloud.js";
import { CommandGuard } from "../commands/command-guard.js";
import type {
  AgentIdentityMaterial,
  SignedAgentCommand,
  UnsignedAgentCommand,
} from "../contracts.js";
import type { AgentLogger } from "../logging/logger.js";
import { RouterCommandExecutor } from "../router/command-executor.js";
import { PreviewOnlyRouterOsAdapter } from "../router/router-adapter.js";
import { canonicalJson, CommandSignatureVerifier } from "../security/command-signature.js";
import { CryptoVault } from "../security/crypto-vault.js";
import { SqliteStore } from "../storage/sqlite-store.js";
import { RuntimeState } from "./runtime-state.js";
import { SiteAgentRuntime } from "./site-agent-runtime.js";

const directories: string[] = [];
const noOpLogger: AgentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function identity(): AgentIdentityMaterial {
  return {
    protocolVersion: 1,
    identityId: "0198a000-0000-7000-8000-000000000011",
    tenantId: "0198a000-0000-7000-8000-000000000001",
    gatewayId: "0198a000-0000-7000-8000-000000000021",
    certificatePem: `-----BEGIN CERTIFICATE-----\n${"A".repeat(80)}\n-----END CERTIFICATE-----`,
    caCertificatePem: `-----BEGIN CERTIFICATE-----\n${"B".repeat(80)}\n-----END CERTIFICATE-----`,
    certificateNotAfter: "2027-08-16T10:00:00.000Z",
    initialCommandSequence: 0,
    privateKeyPem: `-----BEGIN PRIVATE KEY-----\n${"C".repeat(80)}\n-----END PRIVATE KEY-----`,
    enrolledAt: "2026-08-16T10:00:00.000Z",
  };
}

describe("site-agent durable runtime", () => {
  it("persists before execution, publishes through the outbox and never executes a replay twice", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wifi-agent-runtime-"));
    directories.push(directory);
    const store = new SqliteStore(
      join(directory, "agent.sqlite"),
      new CryptoVault(randomBytes(32)),
    );
    const enrolled = identity();
    store.saveIdentity(enrolled);

    const keyPair = generateKeyPairSync("ed25519");
    const unsigned: UnsignedAgentCommand = {
      protocolVersion: 1,
      id: "0198a000-0000-7000-8000-000000000101",
      tenantId: enrolled.tenantId,
      gatewayId: enrolled.gatewayId,
      sequence: 1,
      type: "gateway.inventory.read",
      issuedAt: "2026-08-16T10:00:00.000Z",
      expiresAt: "2026-08-16T10:05:00.000Z",
      payload: {},
    };
    const command: SignedAgentCommand = {
      ...unsigned,
      signature: sign(null, Buffer.from(canonicalJson(unsigned)), keyPair.privateKey).toString(
        "base64",
      ),
    };
    const cloud = new InMemoryMockCloud();
    cloud.addCommand(command);
    const verifier = new CommandSignatureVerifier(
      keyPair.publicKey.export({ format: "der", type: "spki" }),
    );
    const now = () => new Date("2026-08-16T10:01:00.000Z");
    const runtime = new SiteAgentRuntime(
      {
        pollIntervalMs: 5_000,
        heartbeatIntervalMs: 30_000,
        maxCommandsPerPoll: 10,
        backoffBaseMs: 1_000,
        backoffMaxMs: 60_000,
        buildSha: "1234567",
      },
      enrolled,
      cloud,
      store,
      new CommandGuard(verifier, 30_000, 600_000, now),
      new RouterCommandExecutor(
        new PreviewOnlyRouterOsAdapter(),
        "https://captive.wifi.entelsat.com",
        now,
      ),
      new RuntimeState(),
      noOpLogger,
      now,
      () => 0.5,
    );

    await runtime.syncOnce();
    await runtime.syncOnce();

    expect(store.getLastCommandSequence()).toBe(1);
    expect(store.counts()).toEqual({ pendingCommands: 0, pendingOutboxEvents: 0 });
    expect(cloud.events.filter((event) => event.type === "agent.command-result")).toHaveLength(1);
    expect(cloud.events.filter((event) => event.type === "agent.heartbeat")).toHaveLength(1);
    store.close();
  });
});
