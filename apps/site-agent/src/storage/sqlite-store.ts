import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  parseEnrollmentResponse,
  parseSignedAgentCommand,
  type AgentIdentityMaterial,
  type AgentOutboxEvent,
  type CommandOutcome,
  type SignedAgentCommand,
} from "../contracts.js";
import type { CryptoVault } from "../security/crypto-vault.js";

export class CommandSequenceError extends Error {
  readonly code = "COMMAND_SEQUENCE_INVALID";
}

export class CommandConflictError extends Error {
  readonly code = "COMMAND_ID_CONFLICT";
}

export interface StoredCommand {
  readonly command: SignedAgentCommand;
  readonly state: "accepted" | "executing";
}

export interface PendingOutboxEvent {
  readonly event: AgentOutboxEvent;
  readonly attempts: number;
}

export interface StoreCounts {
  readonly pendingCommands: number;
  readonly pendingOutboxEvents: number;
}

type SqliteRow = Readonly<Record<string, unknown>>;

function textColumn(row: SqliteRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new TypeError(`SQLite column ${column} is invalid`);
  }
  return value;
}

function integerColumn(row: SqliteRow, column: string): number {
  const value = row[column];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`SQLite column ${column} is invalid`);
  }
  return value;
}

function parseIdentityMaterial(serialized: string): AgentIdentityMaterial {
  const candidate = JSON.parse(serialized) as unknown;
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new TypeError("Stored agent identity is invalid");
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const enrollment = parseEnrollmentResponse(record);
  if (
    typeof record["privateKeyPem"] !== "string" ||
    !record["privateKeyPem"].includes("PRIVATE KEY")
  ) {
    throw new TypeError("Stored agent private key is invalid");
  }
  if (
    typeof record["enrolledAt"] !== "string" ||
    !Number.isFinite(Date.parse(record["enrolledAt"]))
  ) {
    throw new TypeError("Stored enrollment timestamp is invalid");
  }
  return {
    ...enrollment,
    privateKeyPem: record["privateKeyPem"],
    enrolledAt: record["enrolledAt"],
  };
}

function parseOutboxEvent(serialized: string): AgentOutboxEvent {
  const candidate = JSON.parse(serialized) as unknown;
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new TypeError("Stored outbox event is invalid");
  }
  return candidate as AgentOutboxEvent;
}

export class SqliteStore {
  readonly #database: DatabaseSync;

  constructor(
    databasePath: string,
    private readonly vault: CryptoVault,
  ) {
    const resolvedPath = resolve(databasePath);
    mkdirSync(dirname(resolvedPath), { recursive: true, mode: 0o700 });
    chmodSync(dirname(resolvedPath), 0o700);
    this.#database = new DatabaseSync(resolvedPath);
    try {
      chmodSync(resolvedPath, 0o600);
    } catch {
      this.#database.close();
      throw new Error("Could not restrict permissions on the site-agent database");
    }
    this.#database.exec("PRAGMA journal_mode = WAL");
    this.#database.exec("PRAGMA synchronous = FULL");
    this.#database.exec("PRAGMA foreign_keys = ON");
    this.#database.exec("PRAGMA busy_timeout = 5000");
    this.#database.exec("PRAGMA trusted_schema = OFF");
    this.#migrate();
  }

  #migrate(): void {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS schema_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS agent_identity (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        identity_id TEXT NOT NULL UNIQUE,
        tenant_id TEXT NOT NULL,
        gateway_id TEXT NOT NULL,
        material_ciphertext TEXT NOT NULL,
        certificate_not_after TEXT NOT NULL,
        last_command_sequence INTEGER NOT NULL CHECK (last_command_sequence >= 0),
        enrolled_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY,
        sequence INTEGER NOT NULL UNIQUE CHECK (sequence >= 0),
        type TEXT NOT NULL,
        digest TEXT NOT NULL CHECK (length(digest) = 64),
        command_ciphertext TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('accepted', 'executing', 'completed')),
        result_ciphertext TEXT,
        result_event_id TEXT UNIQUE,
        received_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS commands_pending_idx
        ON commands (state, sequence) WHERE state IN ('accepted', 'executing');

      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        event_ciphertext TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        available_at TEXT NOT NULL,
        delivered_at TEXT,
        last_error_code TEXT,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS outbox_pending_idx
        ON outbox (available_at, created_at) WHERE delivered_at IS NULL;

      INSERT INTO schema_metadata (key, value)
      VALUES ('schema_version', '1')
      ON CONFLICT (key) DO NOTHING;

      UPDATE commands SET state = 'accepted' WHERE state = 'executing';
    `);
    const version = this.#database
      .prepare("SELECT value FROM schema_metadata WHERE key = 'schema_version'")
      .get() as SqliteRow | undefined;
    if (!version || textColumn(version, "value") !== "1") {
      throw new Error("Site-agent database schema version is unsupported");
    }
  }

  close(): void {
    this.#database.close();
  }

  isHealthy(): boolean {
    const row = this.#database.prepare("SELECT 1 AS healthy").get() as SqliteRow | undefined;
    return row?.["healthy"] === 1;
  }

  hasIdentity(): boolean {
    const row = this.#database
      .prepare("SELECT EXISTS(SELECT 1 FROM agent_identity WHERE singleton = 1) AS present")
      .get() as SqliteRow | undefined;
    return row?.["present"] === 1;
  }

  saveIdentity(identity: AgentIdentityMaterial): void {
    const ciphertext = this.vault.encrypt(
      JSON.stringify(identity),
      `identity:${identity.identityId}`,
    );
    try {
      this.#database
        .prepare(
          `INSERT INTO agent_identity (
             singleton, identity_id, tenant_id, gateway_id, material_ciphertext,
             certificate_not_after, last_command_sequence, enrolled_at
           ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          identity.identityId,
          identity.tenantId,
          identity.gatewayId,
          ciphertext,
          identity.certificateNotAfter,
          identity.initialCommandSequence,
          identity.enrolledAt,
        );
    } catch (error) {
      if (this.hasIdentity()) {
        throw new Error("Site agent is already enrolled", { cause: error });
      }
      throw error;
    }
  }

  loadIdentity(): AgentIdentityMaterial | undefined {
    const row = this.#database
      .prepare("SELECT identity_id, material_ciphertext FROM agent_identity WHERE singleton = 1")
      .get() as SqliteRow | undefined;
    if (!row) {
      return undefined;
    }
    const identityId = textColumn(row, "identity_id");
    const plaintext = this.vault.decrypt(
      textColumn(row, "material_ciphertext"),
      `identity:${identityId}`,
    );
    return parseIdentityMaterial(plaintext);
  }

  getLastCommandSequence(): number | undefined {
    const row = this.#database
      .prepare("SELECT last_command_sequence FROM agent_identity WHERE singleton = 1")
      .get() as SqliteRow | undefined;
    return row ? integerColumn(row, "last_command_sequence") : undefined;
  }

  acceptCommand(
    command: SignedAgentCommand,
    digest: string,
    receivedAt: string,
  ): "accepted" | "duplicate" {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.#database
        .prepare("SELECT digest FROM commands WHERE id = ?")
        .get(command.id) as SqliteRow | undefined;
      if (existing) {
        if (textColumn(existing, "digest") !== digest) {
          throw new CommandConflictError("A command ID was reused with different signed content");
        }
        this.#database.exec("COMMIT");
        return "duplicate";
      }

      const identity = this.#database
        .prepare(
          "SELECT tenant_id, gateway_id, last_command_sequence FROM agent_identity WHERE singleton = 1",
        )
        .get() as SqliteRow | undefined;
      if (!identity) {
        throw new Error("Site agent is not enrolled");
      }
      if (
        textColumn(identity, "tenant_id") !== command.tenantId ||
        textColumn(identity, "gateway_id") !== command.gatewayId
      ) {
        throw new CommandSequenceError("Command identity scope does not match this site agent");
      }
      const expectedSequence = integerColumn(identity, "last_command_sequence") + 1;
      if (command.sequence !== expectedSequence) {
        throw new CommandSequenceError("Command sequence is not the next expected value");
      }

      const ciphertext = this.vault.encrypt(JSON.stringify(command), `command:${command.id}`);
      this.#database
        .prepare(
          `INSERT INTO commands (
             id, sequence, type, digest, command_ciphertext, state, received_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?)`,
        )
        .run(
          command.id,
          command.sequence,
          command.type,
          digest,
          ciphertext,
          receivedAt,
          receivedAt,
        );
      this.#database
        .prepare("UPDATE agent_identity SET last_command_sequence = ? WHERE singleton = 1")
        .run(command.sequence);
      this.#database.exec("COMMIT");
      return "accepted";
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  nextPendingCommand(): StoredCommand | undefined {
    const row = this.#database
      .prepare(
        `SELECT id, state, command_ciphertext
           FROM commands
          WHERE state IN ('accepted', 'executing')
          ORDER BY sequence ASC
          LIMIT 1`,
      )
      .get() as SqliteRow | undefined;
    if (!row) {
      return undefined;
    }
    const id = textColumn(row, "id");
    const plaintext = this.vault.decrypt(textColumn(row, "command_ciphertext"), `command:${id}`);
    const state = textColumn(row, "state");
    if (state !== "accepted" && state !== "executing") {
      throw new TypeError("Stored command state is invalid");
    }
    return { command: parseSignedAgentCommand(JSON.parse(plaintext) as unknown), state };
  }

  markCommandExecuting(commandId: string, updatedAt: string): void {
    const result = this.#database
      .prepare(
        `UPDATE commands SET state = 'executing', updated_at = ?
          WHERE id = ? AND state = 'accepted'`,
      )
      .run(updatedAt, commandId);
    if (Number(result.changes) !== 1) {
      throw new Error("Command is not available for execution");
    }
  }

  completeCommand(
    commandId: string,
    outcome: CommandOutcome,
    event: AgentOutboxEvent,
    completedAt: string,
  ): void {
    const resultCiphertext = this.vault.encrypt(JSON.stringify(outcome), `result:${commandId}`);
    const eventCiphertext = this.vault.encrypt(JSON.stringify(event), `outbox:${event.id}`);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const update = this.#database
        .prepare(
          `UPDATE commands
              SET state = 'completed', result_ciphertext = ?, result_event_id = ?, updated_at = ?
            WHERE id = ? AND state = 'executing'`,
        )
        .run(resultCiphertext, event.id, completedAt, commandId);
      if (Number(update.changes) !== 1) {
        throw new Error("Command is not executing");
      }
      this.#database
        .prepare(
          `INSERT INTO outbox (
             id, event_type, event_ciphertext, attempts, available_at, created_at
           ) VALUES (?, ?, ?, 0, ?, ?)`,
        )
        .run(event.id, event.type, eventCiphertext, completedAt, completedAt);
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  enqueueHeartbeatIfDue(event: AgentOutboxEvent, dueBefore: string): boolean {
    const eventCiphertext = this.vault.encrypt(JSON.stringify(event), `outbox:${event.id}`);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const metadata = this.#database
        .prepare("SELECT value FROM schema_metadata WHERE key = 'last_heartbeat_at'")
        .get() as SqliteRow | undefined;
      const pendingHeartbeat = this.#database
        .prepare(
          "SELECT EXISTS(SELECT 1 FROM outbox WHERE event_type = 'agent.heartbeat' AND delivered_at IS NULL) AS present",
        )
        .get() as SqliteRow | undefined;
      if (
        pendingHeartbeat?.["present"] === 1 ||
        (metadata && textColumn(metadata, "value") > dueBefore)
      ) {
        this.#database.exec("COMMIT");
        return false;
      }
      this.#database
        .prepare(
          `INSERT INTO outbox (
             id, event_type, event_ciphertext, attempts, available_at, created_at
           ) VALUES (?, ?, ?, 0, ?, ?)`,
        )
        .run(event.id, event.type, eventCiphertext, event.occurredAt, event.occurredAt);
      this.#database
        .prepare(
          `INSERT INTO schema_metadata (key, value) VALUES ('last_heartbeat_at', ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        )
        .run(event.occurredAt);
      this.#database.exec("COMMIT");
      return true;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  pendingOutbox(now: string, limit: number): readonly PendingOutboxEvent[] {
    const rows = this.#database
      .prepare(
        `SELECT id, event_ciphertext, attempts
           FROM outbox
          WHERE delivered_at IS NULL AND available_at <= ?
          ORDER BY created_at ASC
          LIMIT ?`,
      )
      .all(now, limit) as SqliteRow[];
    return rows.map((row) => {
      const id = textColumn(row, "id");
      const plaintext = this.vault.decrypt(textColumn(row, "event_ciphertext"), `outbox:${id}`);
      return {
        event: parseOutboxEvent(plaintext),
        attempts: integerColumn(row, "attempts"),
      };
    });
  }

  markOutboxDelivered(eventId: string, deliveredAt: string): void {
    this.#database
      .prepare(
        `UPDATE outbox SET delivered_at = ?, last_error_code = NULL
          WHERE id = ? AND delivered_at IS NULL`,
      )
      .run(deliveredAt, eventId);
  }

  deferOutbox(eventId: string, errorCode: string, availableAt: string): void {
    this.#database
      .prepare(
        `UPDATE outbox
            SET attempts = attempts + 1, last_error_code = ?, available_at = ?
          WHERE id = ? AND delivered_at IS NULL`,
      )
      .run(errorCode, availableAt, eventId);
  }

  counts(): StoreCounts {
    const row = this.#database
      .prepare(
        `SELECT
           (SELECT count(*) FROM commands WHERE state IN ('accepted', 'executing')) AS pending_commands,
           (SELECT count(*) FROM outbox WHERE delivered_at IS NULL) AS pending_outbox_events`,
      )
      .get() as SqliteRow | undefined;
    if (!row) {
      throw new Error("Could not read site-agent queue counts");
    }
    return {
      pendingCommands: integerColumn(row, "pending_commands"),
      pendingOutboxEvents: integerColumn(row, "pending_outbox_events"),
    };
  }
}
