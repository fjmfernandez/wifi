import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { SYNTHETIC_IDS as id } from "../prisma/seed-data.js";
import { createApiDatabaseClient, resolveCaptiveAttemptHash, withTenant } from "../src/index.js";

const { Pool } = pg;
const migrationPath = resolve(
  import.meta.dirname,
  "../prisma/migrations/20260816000100_pr03_core/migration.sql",
);
const migration = readFileSync(migrationPath, "utf8");

describe("reviewable security contract", () => {
  test("contains the production FreeRADIUS compatibility surface", () => {
    for (const fragment of [
      'CREATE TABLE "radius_runtime"."credentials"',
      '"nas_identifier" VARCHAR(253) NOT NULL',
      '"calling_station_id" VARCHAR(12)',
      '"verifier_attribute" VARCHAR(32) NOT NULL',
      '"verifier_value" TEXT NOT NULL',
      '"not_before" TIMESTAMPTZ(6) NOT NULL',
      '"packet_source_ip" INET NOT NULL',
      '"authorization_id" UUID',
      "CREATE VIEW radius_runtime.radcheck_compat",
      "CREATE VIEW radius_runtime.radreply_compat",
      "WITH (security_barrier = true, security_invoker = true)",
      'CREATE TABLE "radius_runtime"."post_auth_inbox"',
      'UNIQUE INDEX "accounting_inbox_tenant_id_event_fingerprint_key"',
      "GRANT SELECT (tenant_id, event_fingerprint) ON radius_runtime.accounting_inbox",
      "CREATE POLICY radius_accounting_conflict_read ON radius_runtime.accounting_inbox",
    ]) {
      expect(migration, fragment).toContain(fragment);
    }
  });

  test("keeps login identities outside the migration and runtime groups NOBYPASSRLS", () => {
    expect(migration).not.toMatch(/CREATE ROLE wifi_(?:api|jobs|radius)\b/);
    for (const role of ["wifi_app_runtime", "wifi_worker", "wifi_radius_runtime"]) {
      expect(migration).toContain(`ALTER ROLE ${role} NOLOGIN NOSUPERUSER`);
      expect(migration).toMatch(new RegExp(`ALTER ROLE ${role}[^;]+NOBYPASSRLS`));
    }
  });

  test("stores admin authentication factors without plaintext secrets or tokens", () => {
    for (const table of [
      "admin_credentials",
      "admin_sessions",
      "admin_totp_factors",
      "admin_webauthn_credentials",
    ]) {
      expect(migration).toContain(`CREATE TABLE "app"."${table}"`);
      expect(migration).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
    }
    expect(migration).toContain('"token_hash" BYTEA NOT NULL');
    expect(migration).toContain('"secret_ciphertext" BYTEA NOT NULL');
    expect(migration).toContain('"email_key_version" VARCHAR(80) NOT NULL');
    expect(migration).toContain("admin_users_email_key_version_ck");
    expect(migration).not.toMatch(/\b(?:session_token|totp_secret)\b/i);
  });

  test("routes captive start only through an opaque hashed locator", () => {
    expect(migration).toContain('CREATE TABLE "app"."gateway_captive_locators"');
    expect(migration).toContain('"locator_hash" BYTEA NOT NULL');
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION app.resolve_captive_locator(p_locator_hash bytea)",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION app.resolve_captive_locator(bytea) FROM PUBLIC",
    );
    expect(migration).not.toMatch(/resolve_captive_locator\(p_nas_identifier/i);
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION app.resolve_captive_attempt(p_state_hash bytea)",
    );
  });

  test("aligns admin auth and portal login contracts", () => {
    expect(migration).toContain("hash_algorithm = 'scrypt'");
    expect(migration).toContain("'pin', 'voucher'");
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION app.lookup_admin_auth(p_email_hmac bytea)",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION app.resolve_admin_session(p_token_hash bytea)",
    );
  });

  test("exposes bounded audited worker leases without direct table access", () => {
    for (const fragment of [
      "FOR UPDATE SKIP LOCKED",
      "CREATE OR REPLACE FUNCTION app.claim_outbox_events(",
      "CREATE OR REPLACE FUNCTION app.read_claimed_outbox_event(",
      "CREATE OR REPLACE FUNCTION app.complete_outbox_event(",
      "CREATE OR REPLACE FUNCTION radius_runtime.claim_accounting_events(",
      "CREATE OR REPLACE FUNCTION radius_runtime.complete_accounting_event(",
      "REVOKE ALL ON app.outbox_events FROM wifi_worker",
      "REVOKE ALL ON radius_runtime.accounting_inbox FROM wifi_worker",
    ]) {
      expect(migration).toContain(fragment);
    }
  });
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = testDatabaseUrl ? describe : describe.skip;

integration("PostgreSQL 18 isolation and least privilege", () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDatabaseUrl, max: 2 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  test("every tenant table has enabled and forced RLS", async () => {
    const result = await pool.query<{ schema_name: string; table_name: string }>(`
      SELECT namespace.nspname AS schema_name, relation.relname AS table_name
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE relation.relkind = 'r'
        AND namespace.nspname IN ('app', 'audit', 'radius_runtime', 'agent_runtime')
        AND EXISTS (
          SELECT 1 FROM pg_attribute attribute
          WHERE attribute.attrelid = relation.oid
            AND attribute.attname = 'tenant_id'
            AND NOT attribute.attisdropped
        )
        AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity)
    `);
    expect(result.rows).toEqual([]);
  });

  test("tenant A cannot read or insert tenant B rows", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE wifi_app_runtime");
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [id.tenantA]);
      const sites = await client.query<{ tenant_id: string }>("SELECT tenant_id FROM app.sites");
      expect(sites.rows).toHaveLength(1);
      expect(sites.rows[0]?.tenant_id).toBe(id.tenantA);

      await expect(
        client.query(
          `INSERT INTO app.organizations
             (tenant_id, code, name, status, created_at, updated_at)
           VALUES ($1, 'FORBIDDEN', 'Forbidden cross tenant', 'active', now(), now())`,
          [id.tenantB],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  test("composite foreign keys reject cross-tenant references", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE wifi_app_runtime");
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [id.tenantA]);
      await expect(
        client.query(
          `INSERT INTO app.zones
             (tenant_id, site_id, name, kind, created_at, updated_at)
           VALUES ($1, $2, 'Forbidden FK', 'guest', now(), now())`,
          [id.tenantA, id.siteB],
        ),
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  test("global admin factors are projected only through current-tenant membership", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE wifi_app_runtime");
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [id.tenantA]);
      expect((await client.query("SELECT id FROM app.admin_credentials")).rowCount).toBe(1);
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [id.tenantB]);
      expect((await client.query("SELECT id FROM app.admin_credentials")).rowCount).toBe(0);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  test("admin email ciphertext rejects a blank key version", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await expect(
        client.query(`
          INSERT INTO app.admin_users
            (email_ciphertext, email_key_version, email_hmac, status, updated_at)
          VALUES
            (decode('01', 'hex'), '   ', decode(repeat('ab', 32), 'hex'), 'active', now())
        `),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  test("captive ingress can resolve only the allowlisted projection before tenant context", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE wifi_app_runtime");
      expect((await client.query("SELECT id FROM app.gateway_captive_locators")).rowCount).toBe(0);
      const locatorHash = createHash("sha256")
        .update("synthetic-public-captive-locator-never-used", "utf8")
        .digest();
      const result = await client.query<{
        tenant_id: string;
        gateway_id: string;
        site_id: string;
        allowed_login_origins: string[];
      }>("SELECT * FROM app.resolve_captive_locator($1)", [locatorHash]);
      expect(result.rows).toEqual([
        {
          tenant_id: id.tenantA,
          gateway_id: id.gatewayA,
          site_id: id.siteA,
          allowed_login_origins: ["https://portal.synthetic.invalid"],
        },
      ]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  test("Prisma adapter sets the allowlisted role on every pooled connection", async () => {
    const prisma = createApiDatabaseClient(testDatabaseUrl!, {
      applicationName: "pr03-integration-test",
      connectionLimit: 2,
    });
    try {
      const roles = await prisma.$queryRaw<Array<{ current_role: string }>>`SELECT current_role`;
      expect(roles).toEqual([{ current_role: "wifi_app_runtime" }]);
      const count = await withTenant(prisma, id.tenantA, (transaction) => transaction.site.count());
      expect(count).toBe(1);

      const attempt = await resolveCaptiveAttemptHash(
        prisma,
        createHash("sha256").update("synthetic-state", "utf8").digest(),
      );
      expect(attempt).toEqual({ tenantId: id.tenantA, attemptId: id.attemptA });
    } finally {
      await prisma.$disconnect();
    }
  });

  test("pre-tenant admin auth lookups expose only exact digest projections", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE wifi_app_runtime");
      const auth = await client.query<{
        user_id: string;
        hash_algorithm: string;
        active_tenant_ids: string[];
      }>("SELECT user_id, hash_algorithm, active_tenant_ids FROM app.lookup_admin_auth($1)", [
        createHash("sha256").update("synthetic.admin@example.invalid").digest(),
      ]);
      expect(auth.rows).toEqual([
        { user_id: id.adminUser, hash_algorithm: "scrypt", active_tenant_ids: [id.tenantA] },
      ]);
      const session = await client.query<{ user_id: string; active_tenant_ids: string[] }>(
        "SELECT user_id, active_tenant_ids FROM app.resolve_admin_session($1)",
        [createHash("sha256").update("synthetic-session-token-never-used").digest()],
      );
      expect(session.rows).toEqual([{ user_id: id.adminUser, active_tenant_ids: [id.tenantA] }]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  test("worker claims, rehydrates and completes outbox by claim-token CAS", async () => {
    const client = await pool.connect();
    const workerId = "0198a000-0000-7000-8000-000000009001";
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE wifi_worker");
      const claimed = await client.query<{
        tenant_id: string;
        event_id: string;
        claim_token: string;
      }>("SELECT tenant_id, event_id, claim_token FROM app.claim_outbox_events($1, 10, 60)", [
        workerId,
      ]);
      expect(claimed.rows).toHaveLength(1);
      const claim = claimed.rows[0]!;
      const event = await client.query<{ event: Record<string, unknown> }>(
        "SELECT app.read_claimed_outbox_event($1,$2,$3,$4) AS event",
        [workerId, claim.tenant_id, claim.event_id, claim.claim_token],
      );
      expect(event.rows[0]?.event).toMatchObject({
        result: "claimed",
        event: { eventType: "site.synthetic_seeded" },
      });
      const lost = await client.query<{ result: string }>(
        "SELECT app.complete_outbox_event($1,$2,$3,$4) AS result",
        [workerId, claim.tenant_id, claim.event_id, "0198a000-0000-7000-8000-000000009999"],
      );
      expect(lost.rows[0]?.result).toBe("claim_lost");
      const completed = await client.query<{ result: string }>(
        "SELECT app.complete_outbox_event($1,$2,$3,$4) AS result",
        [workerId, claim.tenant_id, claim.event_id, claim.claim_token],
      );
      expect(completed.rows[0]?.result).toBe("completed");
      const replay = await client.query<{ result: string }>(
        "SELECT app.complete_outbox_event($1,$2,$3,$4) AS result",
        [workerId, claim.tenant_id, claim.event_id, claim.claim_token],
      );
      expect(replay.rows[0]?.result).toBe("already_applied");
      await client.query("RESET ROLE");
      const audit = await client.query<{ action: string }>(
        "SELECT action FROM audit.audit_logs WHERE correlation_id = $1 ORDER BY occurred_at",
        [claim.claim_token],
      );
      expect(audit.rows.map((row) => row.action)).toEqual(["outbox.claim", "outbox.complete"]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  test("worker reconciles accounting idempotently without direct table access", async () => {
    const client = await pool.connect();
    const workerId = "0198a000-0000-7000-8000-000000009002";
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE wifi_worker");
      const claimed = await client.query<{
        tenant_id: string;
        event_id: string;
        claim_token: string;
      }>(
        "SELECT tenant_id, event_id, claim_token FROM radius_runtime.claim_accounting_events($1, 10, 60)",
        [workerId],
      );
      expect(claimed.rows).toHaveLength(1);
      const claim = claimed.rows[0]!;
      const completed = await client.query<{ result: string; session_id: string }>(
        "SELECT * FROM radius_runtime.complete_accounting_event($1,$2,$3,$4)",
        [workerId, claim.tenant_id, claim.event_id, claim.claim_token],
      );
      expect(completed.rows[0]?.result).toBe("completed");
      expect(completed.rows[0]?.session_id).toMatch(/^[0-9a-f-]{36}$/);
      const replay = await client.query<{ result: string; session_id: string }>(
        "SELECT * FROM radius_runtime.complete_accounting_event($1,$2,$3,$4)",
        [workerId, claim.tenant_id, claim.event_id, claim.claim_token],
      );
      expect(replay.rows[0]).toEqual(
        completed.rows[0] && { ...completed.rows[0], result: "already_applied" },
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  test("worker has no direct cross-tenant queue table privilege", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE wifi_worker");
      await expect(client.query("SELECT id FROM app.outbox_events LIMIT 1")).rejects.toMatchObject({
        code: "42501",
      });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  test("FreeRADIUS can authorize globally but cannot read application PII", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE wifi_radius_runtime");
      const check = await client.query<{ username: string }>(
        "SELECT username FROM radius_runtime.radcheck_compat WHERE username = 'synthetic-radius-user-a'",
      );
      expect(check.rows).toEqual([{ username: "synthetic-radius-user-a" }]);
      await expect(client.query("SELECT id FROM app.end_users LIMIT 1")).rejects.toMatchObject({
        code: "42501",
      });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  test("FreeRADIUS accounting retransmission is idempotent under FORCE RLS", async () => {
    const client = await pool.connect();
    const fingerprint = "f".repeat(64);
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE wifi_radius_runtime");
      const statement = `
        INSERT INTO radius_runtime.accounting_inbox (
          tenant_id, gateway_id, authorization_id, username, nas_identifier,
          packet_source_ip, acct_session_id, status_type, nas_input_octets,
          nas_output_octets, event_fingerprint
        ) VALUES ($1, $2, $3, 'synthetic-radius-user-a', 'nas-synthetic-alpha',
                  '192.0.2.10'::inet, 'synthetic-retransmission', 'Interim-Update',
                  1, 2, $4)
        ON CONFLICT (tenant_id, event_fingerprint) DO NOTHING
      `;
      expect(
        (await client.query(statement, [id.tenantA, id.gatewayA, id.authorizationA, fingerprint]))
          .rowCount,
      ).toBe(1);
      expect(
        (await client.query(statement, [id.tenantA, id.gatewayA, id.authorizationA, fingerprint]))
          .rowCount,
      ).toBe(0);
      await expect(
        client.query("SELECT username FROM radius_runtime.accounting_inbox LIMIT 1"),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
