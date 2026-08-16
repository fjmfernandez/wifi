import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type {
  AgentIdentityMaterial,
  AgentOutboxEvent,
  CommandOutcome,
  SignedAgentCommand,
} from "../contracts.js";
import { CryptoVault } from "../security/crypto-vault.js";
import { CommandConflictError, CommandSequenceError, SqliteStore } from "./sqlite-store.js";

const temporaryDirectories: string[] = [];

function temporaryDatabase(): { readonly path: string; readonly key: Buffer } {
  const directory = mkdtempSync(join(tmpdir(), "wifi-site-agent-"));
  temporaryDirectories.push(directory);
  return { path: join(directory, "agent.sqlite"), key: randomBytes(32) };
}

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

function command(sequence: number, id = randomUUID()): SignedAgentCommand {
  return {
    protocolVersion: 1,
    id,
    tenantId: identity().tenantId,
    gatewayId: identity().gatewayId,
    sequence,
    type: "gateway.inventory.read",
    issuedAt: "2026-08-16T10:00:00.000Z",
    expiresAt: "2026-08-16T10:05:00.000Z",
    payload: {},
    signature: randomBytes(64).toString("base64"),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite durable state", () => {
  it("persists encrypted identity, commands and result outbox across restart", () => {
    const temporary = temporaryDatabase();
    let store = new SqliteStore(temporary.path, new CryptoVault(temporary.key));
    const enrolled = identity();
    store.saveIdentity(enrolled);
    const first = command(1);
    expect(store.acceptCommand(first, "a".repeat(64), "2026-08-16T10:00:01.000Z")).toBe("accepted");
    expect(store.acceptCommand(first, "a".repeat(64), "2026-08-16T10:00:02.000Z")).toBe(
      "duplicate",
    );
    store.markCommandExecuting(first.id, "2026-08-16T10:00:03.000Z");
    const outcome: CommandOutcome = {
      commandId: first.id,
      commandSequence: 1,
      status: "succeeded",
      code: "INVENTORY_READ",
      completedAt: "2026-08-16T10:00:04.000Z",
      evidence: {},
    };
    const event: AgentOutboxEvent = {
      id: randomUUID(),
      protocolVersion: 1,
      identityId: enrolled.identityId,
      tenantId: enrolled.tenantId,
      gatewayId: enrolled.gatewayId,
      type: "agent.command-result",
      occurredAt: outcome.completedAt,
      payload: { outcome },
    };
    store.completeCommand(first.id, outcome, event, outcome.completedAt);
    store.close();
    expect(readFileSync(temporary.path).includes(Buffer.from("BEGIN PRIVATE KEY"))).toBe(false);

    store = new SqliteStore(temporary.path, new CryptoVault(temporary.key));
    expect(store.loadIdentity()).toEqual(enrolled);
    expect(store.counts()).toEqual({ pendingCommands: 0, pendingOutboxEvents: 1 });
    expect(store.pendingOutbox("2026-08-16T10:01:00.000Z", 10)[0]?.event).toEqual(event);
    store.close();
  });

  it("fails closed on sequence gaps, command ID conflicts and another gateway", () => {
    const temporary = temporaryDatabase();
    const store = new SqliteStore(temporary.path, new CryptoVault(temporary.key));
    store.saveIdentity(identity());
    expect(() =>
      store.acceptCommand(command(2), "a".repeat(64), "2026-08-16T10:00:00.000Z"),
    ).toThrow(CommandSequenceError);

    const first = command(1);
    store.acceptCommand(first, "a".repeat(64), "2026-08-16T10:00:00.000Z");
    expect(() => store.acceptCommand(first, "b".repeat(64), "2026-08-16T10:00:00.000Z")).toThrow(
      CommandConflictError,
    );
    expect(() =>
      store.acceptCommand(
        { ...command(2), gatewayId: "0198a000-0000-7000-8000-000000000099" },
        "c".repeat(64),
        "2026-08-16T10:00:00.000Z",
      ),
    ).toThrow(CommandSequenceError);
    store.close();
  });
});
