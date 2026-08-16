import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client/client.js";
import type { Prisma } from "./generated/client/client.js";

export const DATABASE_RUNTIME_ROLES = ["wifi_app_runtime", "wifi_worker"] as const;

export type DatabaseRuntimeRole = (typeof DATABASE_RUNTIME_ROLES)[number];
export type TenantTransaction = Prisma.TransactionClient;

export interface DatabaseClientOptions {
  /** Compile-time and runtime allowlisted; never derive this from request input. */
  role?: DatabaseRuntimeRole;
  applicationName?: string;
  connectionLimit?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}

export interface CaptiveLocatorRoute {
  tenantId: string;
  gatewayId: string;
  siteId: string;
  allowedLoginOrigins: string[];
}

export interface CaptiveAttemptRoute {
  tenantId: string;
  attemptId: string;
}

function assertDigest(value: Uint8Array, label: string): Buffer {
  if (value.byteLength !== 32) {
    throw new TypeError(`${label} must be a 32-byte SHA-256 digest`);
  }
  return Buffer.from(value);
}

export function createDatabaseClient(
  connectionString: string,
  options: DatabaseClientOptions = {},
): PrismaClient {
  if (!connectionString) {
    throw new TypeError("connectionString is required");
  }
  const role = options.role ?? "wifi_app_runtime";
  if (!DATABASE_RUNTIME_ROLES.includes(role)) {
    throw new TypeError("database role is not allowlisted");
  }
  const connectionLimit = options.connectionLimit ?? 10;
  if (!Number.isInteger(connectionLimit) || connectionLimit < 1 || connectionLimit > 100) {
    throw new RangeError("connectionLimit must be an integer between 1 and 100");
  }

  // PostgreSQL applies this startup option independently to every physical pool
  // connection. NOINHERIT login roles therefore never execute an unprivileged
  // query by accident, and pooled connections cannot lose their group role.
  const adapter = new PrismaPg({
    connectionString,
    options: `-c role=${role}`,
    application_name: options.applicationName ?? `wifi-entelsat-${role}`,
    max: connectionLimit,
    ...(options.connectionTimeoutMillis === undefined
      ? {}
      : { connectionTimeoutMillis: options.connectionTimeoutMillis }),
    ...(options.idleTimeoutMillis === undefined
      ? {}
      : { idleTimeoutMillis: options.idleTimeoutMillis }),
  });
  return new PrismaClient({ adapter });
}

export function createApiDatabaseClient(
  connectionString: string,
  options: Omit<DatabaseClientOptions, "role"> = {},
): PrismaClient {
  return createDatabaseClient(connectionString, { ...options, role: "wifi_app_runtime" });
}

export function createWorkerDatabaseClient(
  connectionString: string,
  options: Omit<DatabaseClientOptions, "role"> = {},
): PrismaClient {
  return createDatabaseClient(connectionString, { ...options, role: "wifi_worker" });
}

export async function withTenant<T>(
  client: PrismaClient,
  tenantId: string,
  operation: (transaction: TenantTransaction) => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new TypeError("tenantId must be an RFC 9562 UUID");
  }

  return client.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return operation(transaction);
  });
}

export async function resolveCaptiveLocatorHash(
  client: PrismaClient,
  locatorHash: Uint8Array,
): Promise<CaptiveLocatorRoute | null> {
  const digest = assertDigest(locatorHash, "locatorHash");
  const rows = await client.$queryRaw<
    Array<{
      tenant_id: string;
      gateway_id: string;
      site_id: string;
      allowed_login_origins: string[];
    }>
  >`SELECT tenant_id, gateway_id, site_id, allowed_login_origins
      FROM app.resolve_captive_locator(${digest})`;
  const row = rows[0];
  return row
    ? {
        tenantId: row.tenant_id,
        gatewayId: row.gateway_id,
        siteId: row.site_id,
        allowedLoginOrigins: row.allowed_login_origins,
      }
    : null;
}

export async function resolveCaptiveAttemptHash(
  client: PrismaClient,
  stateHash: Uint8Array,
): Promise<CaptiveAttemptRoute | null> {
  const digest = assertDigest(stateHash, "stateHash");
  const rows = await client.$queryRaw<Array<{ tenant_id: string; attempt_id: string }>>`
    SELECT tenant_id, attempt_id FROM app.resolve_captive_attempt(${digest})
  `;
  const row = rows[0];
  return row ? { tenantId: row.tenant_id, attemptId: row.attempt_id } : null;
}
