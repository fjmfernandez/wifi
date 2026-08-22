import { randomUUID } from "node:crypto";

import pg from "pg";

const { Client } = pg;

const BOOTSTRAP_DATABASE_USER = "wifi_bootstrap";
const BOOTSTRAP_LOCK_NAME = "wifi-entelsat.initial-admin-bootstrap.v1";
const RESET_PASSWORD_LOCK_NAME = "wifi-entelsat.admin-password-reset.v1";
const INITIAL_ROLE_CODE = "chain_admin";
const INITIAL_ROLE_NAME = "Administrador de cadena";

export interface InitialAdminBootstrapInput {
  tenantSlug: string;
  tenantName: string;
  dataRegion: string;
  defaultTimezone: string;
  emailHmac: Uint8Array;
  permissionCodes: readonly string[];
  permissionDescriptions: readonly string[];
}

export interface InitialAdminBootstrapMaterial<OneTimeOutput> {
  emailCiphertext: Uint8Array;
  emailKeyVersion: string;
  passwordHash: string;
  totpLabel: string;
  totpSecretCiphertext: Uint8Array;
  totpKeyVersion: string;
  recoveryCodeHashes: readonly Uint8Array[];
  oneTimeOutput: OneTimeOutput;
}

export type InitialAdminBootstrapResult<OneTimeOutput> =
  | {
      status: "created";
      tenantId: string;
      userId: string;
      oneTimeOutput: OneTimeOutput;
    }
  | {
      status: "already_exists";
      tenantId: string;
      userId: string;
    };

interface ExistingTenantRow {
  id: string;
  name: string;
  status: string;
  data_region: string;
  default_timezone: string;
}

interface ExistingUserRow {
  id: string;
  status: string;
}

interface ExistingBootstrapStateRow {
  membership_id: string | null;
  credential_ready: boolean;
  totp_ready: boolean;
  role_id: string | null;
  assignment_ready: boolean;
  permission_codes: string[];
}

export class InitialAdminBootstrapConflictError extends Error {
  readonly code = "INITIAL_ADMIN_BOOTSTRAP_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "InitialAdminBootstrapConflictError";
  }
}

export class AdminPasswordResetError extends Error {
  readonly code = "ADMIN_PASSWORD_RESET_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "AdminPasswordResetError";
  }
}

function assertBootstrapConnectionString(connectionString: string): void {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new TypeError("BOOTSTRAP_DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new TypeError("BOOTSTRAP_DATABASE_URL must use PostgreSQL");
  }
  if (decodeURIComponent(url.username) !== BOOTSTRAP_DATABASE_USER) {
    throw new TypeError(`BOOTSTRAP_DATABASE_URL must authenticate as ${BOOTSTRAP_DATABASE_USER}`);
  }
  if (!url.password || url.pathname.length < 2) {
    throw new TypeError("BOOTSTRAP_DATABASE_URL requires a password and database name");
  }
  if (url.searchParams.has("options")) {
    throw new TypeError("BOOTSTRAP_DATABASE_URL must not override PostgreSQL startup options");
  }
}

function assertInput(input: InitialAdminBootstrapInput): void {
  if (input.emailHmac.byteLength !== 32) {
    throw new TypeError("emailHmac must be a 32-byte digest");
  }
  if (
    input.permissionCodes.length === 0 ||
    input.permissionCodes.length !== input.permissionDescriptions.length ||
    new Set(input.permissionCodes).size !== input.permissionCodes.length
  ) {
    throw new TypeError("The permission catalog is incomplete or contains duplicates");
  }
  if (input.permissionCodes.some((code) => !/^[a-z][a-z0-9_.-]{2,119}$/.test(code))) {
    throw new TypeError("The permission catalog contains an invalid code");
  }
}

function assertMaterial<OneTimeOutput>(
  material: InitialAdminBootstrapMaterial<OneTimeOutput>,
): void {
  if (material.emailCiphertext.byteLength === 0) {
    throw new TypeError("Encrypted email is required");
  }
  if (material.totpSecretCiphertext.byteLength === 0) {
    throw new TypeError("Encrypted TOTP secret is required");
  }
  if (
    material.emailKeyVersion.trim().length === 0 ||
    material.emailKeyVersion.length > 80 ||
    material.totpKeyVersion.trim().length === 0 ||
    material.totpKeyVersion.length > 80
  ) {
    throw new TypeError("Encryption key versions must contain between 1 and 80 characters");
  }
  if (!material.passwordHash.startsWith("$scrypt$")) {
    throw new TypeError("Initial admin password must use scrypt");
  }
  if (
    material.recoveryCodeHashes.length < 8 ||
    material.recoveryCodeHashes.length > 20 ||
    material.recoveryCodeHashes.some((hash) => hash.byteLength !== 32)
  ) {
    throw new TypeError("Recovery code hashes must contain 8 to 20 SHA-256-sized values");
  }
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = sorted(left);
  const sortedRight = sorted(right);
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

/**
 * Creates the first tenant owner under one deployment-only transaction.
 *
 * This path intentionally cannot use the runtime Prisma client: the operation
 * bootstraps tenant-scoped rows and therefore requires the isolated
 * `wifi_bootstrap` deployment identity. The material factory is called only
 * after the advisory lock and only for a truly empty bootstrap target, so a
 * safe idempotent rerun never creates or returns replacement MFA secrets.
 */
export async function bootstrapInitialAdmin<OneTimeOutput>(
  connectionString: string,
  input: InitialAdminBootstrapInput,
  createMaterial: (userId: string) => Promise<InitialAdminBootstrapMaterial<OneTimeOutput>>,
): Promise<InitialAdminBootstrapResult<OneTimeOutput>> {
  assertBootstrapConnectionString(connectionString);
  assertInput(input);

  const client = new Client({
    connectionString,
    application_name: "wifi-entelsat-initial-admin-bootstrap",
  });
  await client.connect();

  try {
    const identity = await client.query<{
      current_user: string;
      session_user: string;
      rolsuper: boolean;
    }>(`
      SELECT current_user, session_user, role.rolsuper
        FROM pg_catalog.pg_roles AS role
       WHERE role.rolname = current_user
    `);
    const principal = identity.rows[0];
    if (
      !principal ||
      principal.current_user !== BOOTSTRAP_DATABASE_USER ||
      principal.session_user !== BOOTSTRAP_DATABASE_USER ||
      !principal.rolsuper
    ) {
      throw new TypeError(
        `Initial admin bootstrap requires the dedicated ${BOOTSTRAP_DATABASE_USER} superuser`,
      );
    }

    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL row_security = off");
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL statement_timeout = '60s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '60s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        BOOTSTRAP_LOCK_NAME,
      ]);

      const tenantResult = await client.query<ExistingTenantRow>(
        `SELECT id, name, status, data_region, default_timezone
           FROM app.tenants
          WHERE slug = $1`,
        [input.tenantSlug],
      );
      const userResult = await client.query<ExistingUserRow>(
        `SELECT id, status
           FROM app.admin_users
          WHERE email_hmac = $1`,
        [Buffer.from(input.emailHmac)],
      );
      const tenant = tenantResult.rows[0];
      const user = userResult.rows[0];

      if (tenant || user) {
        if (!tenant || !user) {
          throw new InitialAdminBootstrapConflictError(
            "The tenant slug or administrator identity is already reserved independently",
          );
        }
        if (
          tenant.name !== input.tenantName ||
          tenant.status !== "active" ||
          tenant.data_region !== input.dataRegion ||
          tenant.default_timezone !== input.defaultTimezone ||
          user.status !== "active"
        ) {
          throw new InitialAdminBootstrapConflictError(
            "Existing tenant or administrator state does not match this bootstrap request",
          );
        }

        const stateResult = await client.query<ExistingBootstrapStateRow>(
          `SELECT
             membership.id AS membership_id,
             EXISTS (
               SELECT 1 FROM app.admin_credentials AS credential
                WHERE credential.user_id = $2
                  AND credential.hash_algorithm = 'scrypt'
             ) AS credential_ready,
             EXISTS (
               SELECT 1 FROM app.admin_totp_factors AS factor
                WHERE factor.user_id = $2
                  AND factor.verified_at IS NOT NULL
                  AND factor.revoked_at IS NULL
             ) AS totp_ready,
             role.id AS role_id,
             EXISTS (
               SELECT 1 FROM app.role_assignments AS assignment
                WHERE assignment.tenant_id = $1
                  AND assignment.membership_id = membership.id
                  AND assignment.role_id = role.id
                  AND assignment.scope_type = 'tenant'
                  AND assignment.expires_at IS NULL
             ) AS assignment_ready,
             COALESCE((
               SELECT array_agg(permission.permission_code ORDER BY permission.permission_code)
                 FROM app.role_permissions AS permission
                WHERE permission.tenant_id = $1
                  AND permission.role_id = role.id
             ), ARRAY[]::varchar[]) AS permission_codes
            FROM app.tenant_memberships AS membership
            LEFT JOIN app.tenant_roles AS role
              ON role.tenant_id = membership.tenant_id
             AND role.code = $3
           WHERE membership.tenant_id = $1
             AND membership.user_id = $2
             AND membership.status = 'active'`,
          [tenant.id, user.id, INITIAL_ROLE_CODE],
        );
        const state = stateResult.rows[0];
        if (
          !state?.membership_id ||
          !state.credential_ready ||
          !state.totp_ready ||
          !state.role_id ||
          !state.assignment_ready ||
          !sameStringArray(state.permission_codes, input.permissionCodes)
        ) {
          throw new InitialAdminBootstrapConflictError(
            "Existing bootstrap records are incomplete or have a different permission set",
          );
        }

        await client.query("COMMIT");
        return { status: "already_exists", tenantId: tenant.id, userId: user.id };
      }

      const tenantId = randomUUID();
      const userId = randomUUID();
      const membershipId = randomUUID();
      const roleId = randomUUID();
      const material = await createMaterial(userId);
      assertMaterial(material);

      await client.query(
        `INSERT INTO app.tenants
           (id, slug, name, status, data_region, default_timezone, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', $4, $5, clock_timestamp(), clock_timestamp())`,
        [tenantId, input.tenantSlug, input.tenantName, input.dataRegion, input.defaultTimezone],
      );
      await client.query(
        `INSERT INTO app.admin_users
           (id, email_ciphertext, email_key_version, email_hmac, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'active', clock_timestamp(), clock_timestamp())`,
        [
          userId,
          Buffer.from(material.emailCiphertext),
          material.emailKeyVersion,
          Buffer.from(input.emailHmac),
        ],
      );
      await client.query(
        `INSERT INTO app.admin_credentials
           (id, user_id, password_hash, hash_algorithm, hash_version,
            password_changed_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'scrypt', 1,
                 clock_timestamp(), clock_timestamp(), clock_timestamp())`,
        [randomUUID(), userId, material.passwordHash],
      );
      await client.query(
        `INSERT INTO app.tenant_memberships
           (id, tenant_id, user_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', clock_timestamp(), clock_timestamp())`,
        [membershipId, tenantId, userId],
      );
      await client.query(
        `INSERT INTO app.permission_catalog (code, description, created_at)
         SELECT source.code, source.description, clock_timestamp()
           FROM unnest($1::text[], $2::text[]) AS source(code, description)
         ON CONFLICT (code) DO NOTHING`,
        [input.permissionCodes, input.permissionDescriptions],
      );
      await client.query(
        `INSERT INTO app.tenant_roles
           (id, tenant_id, code, name, system_role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, clock_timestamp(), clock_timestamp())`,
        [roleId, tenantId, INITIAL_ROLE_CODE, INITIAL_ROLE_NAME],
      );
      await client.query(
        `INSERT INTO app.role_permissions
           (id, tenant_id, role_id, permission_code)
         SELECT uuidv7(), $1, $2, source.code
           FROM unnest($3::text[]) AS source(code)`,
        [tenantId, roleId, input.permissionCodes],
      );
      await client.query(
        `INSERT INTO app.role_assignments
           (id, tenant_id, membership_id, role_id, scope_type, starts_at, created_at)
         VALUES ($1, $2, $3, $4, 'tenant', clock_timestamp(), clock_timestamp())`,
        [randomUUID(), tenantId, membershipId, roleId],
      );
      await client.query(
        `INSERT INTO app.admin_totp_factors
           (id, user_id, label, secret_ciphertext, key_version,
            recovery_code_hashes, verified_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::bytea[], clock_timestamp(), clock_timestamp())`,
        [
          randomUUID(),
          userId,
          material.totpLabel,
          Buffer.from(material.totpSecretCiphertext),
          material.totpKeyVersion,
          material.recoveryCodeHashes.map((hash) => Buffer.from(hash)),
        ],
      );
      await client.query(
        `INSERT INTO audit.audit_logs
           (id, tenant_id, actor_type, actor_id, action, resource_type, resource_id,
            scope, after_redacted, correlation_id, reason, occurred_at)
         VALUES ($1, $2, 'service', NULL, 'admin.initial_bootstrap', 'tenant', $2,
                 $3::jsonb, $4::jsonb, $5,
                 'One-time deployment bootstrap using the isolated database identity',
                 clock_timestamp())`,
        [
          randomUUID(),
          tenantId,
          JSON.stringify({ tenantId }),
          JSON.stringify({
            roleCode: INITIAL_ROLE_CODE,
            permissionCount: input.permissionCodes.length,
            mfa: "totp",
          }),
          randomUUID(),
        ],
      );

      await client.query("COMMIT");
      return {
        status: "created",
        tenantId,
        userId,
        oneTimeOutput: material.oneTimeOutput,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}

export interface AdminPasswordResetInput {
  emailHmac: Uint8Array;
  passwordHash: string;
}

export interface AdminPasswordResetResult {
  userId: string;
  tenantIds: string[];
  revokedSessionCount: number;
}

/**
 * Deployment-only emergency reset for an existing administrator password.
 *
 * It intentionally authenticates with the isolated `wifi_bootstrap` identity,
 * bypasses RLS inside one audited transaction, and never receives plaintext
 * email or password. Callers provide only the HMAC identity and scrypt hash.
 */
export async function resetAdminPassword(
  connectionString: string,
  input: AdminPasswordResetInput,
): Promise<AdminPasswordResetResult> {
  assertBootstrapConnectionString(connectionString);
  if (input.emailHmac.byteLength !== 32) {
    throw new TypeError("emailHmac must be a 32-byte digest");
  }
  if (!input.passwordHash.startsWith("$scrypt$")) {
    throw new TypeError("Admin password reset requires a scrypt hash");
  }

  const client = new Client({
    connectionString,
    application_name: "wifi-entelsat-admin-password-reset",
  });
  await client.connect();

  try {
    const identity = await client.query<{
      current_user: string;
      session_user: string;
      rolsuper: boolean;
    }>(`
      SELECT current_user, session_user, role.rolsuper
        FROM pg_catalog.pg_roles AS role
       WHERE role.rolname = current_user
    `);
    const principal = identity.rows[0];
    if (
      !principal ||
      principal.current_user !== BOOTSTRAP_DATABASE_USER ||
      principal.session_user !== BOOTSTRAP_DATABASE_USER ||
      !principal.rolsuper
    ) {
      throw new TypeError(
        `Admin password reset requires the dedicated ${BOOTSTRAP_DATABASE_USER} superuser`,
      );
    }

    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL row_security = off");
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL statement_timeout = '60s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '60s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        RESET_PASSWORD_LOCK_NAME,
      ]);

      const userResult = await client.query<ExistingUserRow>(
        `SELECT id, status
           FROM app.admin_users
          WHERE email_hmac = $1
          FOR UPDATE`,
        [Buffer.from(input.emailHmac)],
      );
      const user = userResult.rows[0];
      if (!user) {
        throw new AdminPasswordResetError("No administrator matches the requested identity");
      }
      if (user.status !== "active") {
        throw new AdminPasswordResetError("The requested administrator is not active");
      }

      const tenantResult = await client.query<{ tenant_id: string }>(
        `SELECT tenant_id
           FROM app.tenant_memberships
          WHERE user_id = $1
            AND status = 'active'
          ORDER BY tenant_id`,
        [user.id],
      );
      const tenantIds = tenantResult.rows.map((row) => row.tenant_id);
      if (tenantIds.length === 0) {
        throw new AdminPasswordResetError("The requested administrator has no active tenant");
      }

      const credentialResult = await client.query(
        `UPDATE app.admin_credentials
            SET password_hash = $2,
                hash_algorithm = 'scrypt',
                hash_version = hash_version + 1,
                failed_attempts = 0,
                locked_until = NULL,
                password_changed_at = clock_timestamp(),
                updated_at = clock_timestamp()
          WHERE user_id = $1`,
        [user.id, input.passwordHash],
      );
      if (credentialResult.rowCount !== 1) {
        throw new AdminPasswordResetError("The requested administrator has no password credential");
      }

      const sessionResult = await client.query(
        `UPDATE app.admin_sessions
            SET revoked_at = clock_timestamp()
          WHERE user_id = $1
            AND revoked_at IS NULL`,
        [user.id],
      );

      for (const tenantId of tenantIds) {
        await client.query(
          `INSERT INTO audit.audit_logs
             (id, tenant_id, actor_type, actor_id, action, resource_type, resource_id,
              scope, after_redacted, correlation_id, reason, occurred_at)
           VALUES ($1, $2, 'service', NULL, 'admin.password_reset', 'admin_user', $3,
                   $4::jsonb, $5::jsonb, $6,
                   'Deployment emergency reset using the isolated database identity',
                   clock_timestamp())`,
          [
            randomUUID(),
            tenantId,
            user.id,
            JSON.stringify({ tenantId }),
            JSON.stringify({
              passwordHash: "rotated",
              revokedSessionCount: sessionResult.rowCount ?? 0,
            }),
            randomUUID(),
          ],
        );
      }

      await client.query("COMMIT");
      return {
        userId: user.id,
        tenantIds,
        revokedSessionCount: sessionResult.rowCount ?? 0,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}
