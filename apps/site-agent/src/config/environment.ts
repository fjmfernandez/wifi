import { createPublicKey } from "node:crypto";
import { isAbsolute } from "node:path";

export type AgentNodeEnvironment = "development" | "test" | "staging" | "production";
export type AgentLogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface AgentEnvironment {
  readonly nodeEnvironment: AgentNodeEnvironment;
  readonly cloudOrigin: string;
  readonly captiveOrigin: string;
  readonly databasePath: string;
  readonly storageKey: Buffer;
  readonly commandSigningPublicKeyDer: Buffer;
  readonly enrollmentToken?: string;
  readonly healthHost: "127.0.0.1";
  readonly healthPort: number;
  readonly pollIntervalMs: number;
  readonly heartbeatIntervalMs: number;
  readonly cloudTimeoutMs: number;
  readonly shutdownTimeoutMs: number;
  readonly maxCommandsPerPoll: number;
  readonly commandClockSkewMs: number;
  readonly commandMaxTtlMs: number;
  readonly readinessMaxCloudStalenessMs: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  readonly logLevel: AgentLogLevel;
  readonly buildSha: string;
}

export interface RawAgentEnvironment {
  readonly NODE_ENV?: unknown;
  readonly SITE_AGENT_CLOUD_URL?: unknown;
  readonly SITE_AGENT_CAPTIVE_ORIGIN?: unknown;
  readonly SITE_AGENT_DB_PATH?: unknown;
  readonly SITE_AGENT_STORAGE_KEY_BASE64?: unknown;
  readonly SITE_AGENT_COMMAND_SIGNING_PUBLIC_KEY_BASE64?: unknown;
  readonly SITE_AGENT_ENROLLMENT_TOKEN?: unknown;
  readonly SITE_AGENT_HEALTH_HOST?: unknown;
  readonly SITE_AGENT_HEALTH_PORT?: unknown;
  readonly SITE_AGENT_POLL_INTERVAL_MS?: unknown;
  readonly SITE_AGENT_HEARTBEAT_INTERVAL_MS?: unknown;
  readonly SITE_AGENT_CLOUD_TIMEOUT_MS?: unknown;
  readonly SITE_AGENT_SHUTDOWN_TIMEOUT_MS?: unknown;
  readonly SITE_AGENT_MAX_COMMANDS_PER_POLL?: unknown;
  readonly SITE_AGENT_COMMAND_CLOCK_SKEW_MS?: unknown;
  readonly SITE_AGENT_COMMAND_MAX_TTL_MS?: unknown;
  readonly SITE_AGENT_READINESS_MAX_CLOUD_STALENESS_MS?: unknown;
  readonly SITE_AGENT_BACKOFF_BASE_MS?: unknown;
  readonly SITE_AGENT_BACKOFF_MAX_MS?: unknown;
  readonly LOG_LEVEL?: unknown;
  readonly BUILD_SHA?: unknown;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
  name: string,
): T[number] {
  const candidate = typeof value === "string" && value.length > 0 ? value : fallback;
  if (!allowed.includes(candidate)) {
    throw new TypeError(`${name} has an unsupported value`);
  }
  return candidate;
}

function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const candidate = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new TypeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return candidate;
}

function base64(value: unknown, name: string, exactBytes?: number): Buffer {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new TypeError(`${name} must be non-empty canonical base64`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || decoded.toString("base64") !== value) {
    throw new TypeError(`${name} must be canonical base64`);
  }
  if (exactBytes !== undefined && decoded.length !== exactBytes) {
    throw new TypeError(`${name} must decode to exactly ${exactBytes} bytes`);
  }
  return decoded;
}

function origin(value: unknown, name: string, nodeEnvironment: AgentNodeEnvironment): string {
  if (typeof value !== "string") {
    throw new TypeError(`${name} is required`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${name} must be a valid absolute URL`);
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new TypeError(`${name} must be an origin without credentials, path, query or fragment`);
  }

  const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  const insecureAllowed =
    (nodeEnvironment === "development" || nodeEnvironment === "test") && loopback;
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && insecureAllowed)) {
    throw new TypeError(`${name} must use HTTPS`);
  }
  return parsed.origin;
}

function enrollmentToken(value: unknown): string | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (
    typeof value !== "string" ||
    value.length < 32 ||
    value.length > 512 ||
    !/^[A-Za-z0-9._~-]+$/.test(value)
  ) {
    throw new TypeError("SITE_AGENT_ENROLLMENT_TOKEN must be an opaque base64url-style token");
  }
  return value;
}

export function parseEnvironment(input: RawAgentEnvironment): AgentEnvironment {
  const nodeEnvironment = enumValue(
    input.NODE_ENV,
    ["development", "test", "staging", "production"] as const,
    "development",
    "NODE_ENV",
  );
  const databasePath =
    typeof input.SITE_AGENT_DB_PATH === "string" && input.SITE_AGENT_DB_PATH.length > 0
      ? input.SITE_AGENT_DB_PATH
      : "./data/site-agent.sqlite";

  if (databasePath === ":memory:") {
    throw new TypeError("SITE_AGENT_DB_PATH must be durable; :memory: is not allowed");
  }
  if (nodeEnvironment === "production" && !isAbsolute(databasePath)) {
    throw new TypeError("SITE_AGENT_DB_PATH must be absolute in production");
  }

  const commandSigningPublicKeyDer = base64(
    input.SITE_AGENT_COMMAND_SIGNING_PUBLIC_KEY_BASE64,
    "SITE_AGENT_COMMAND_SIGNING_PUBLIC_KEY_BASE64",
  );
  try {
    const key = createPublicKey({ key: commandSigningPublicKeyDer, format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ed25519") {
      throw new TypeError("command signing key is not Ed25519");
    }
  } catch {
    throw new TypeError(
      "SITE_AGENT_COMMAND_SIGNING_PUBLIC_KEY_BASE64 must contain an Ed25519 SPKI public key",
    );
  }

  const healthHost = enumValue(
    input.SITE_AGENT_HEALTH_HOST,
    ["127.0.0.1"] as const,
    "127.0.0.1",
    "SITE_AGENT_HEALTH_HOST",
  );
  const logLevel = enumValue(
    input.LOG_LEVEL,
    ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const,
    "info",
    "LOG_LEVEL",
  );
  const buildSha =
    typeof input.BUILD_SHA === "string" && /^[A-Za-z0-9._-]{7,64}$/.test(input.BUILD_SHA)
      ? input.BUILD_SHA
      : "development";
  const parsedEnrollmentToken = enrollmentToken(input.SITE_AGENT_ENROLLMENT_TOKEN);

  const environment: AgentEnvironment = {
    nodeEnvironment,
    cloudOrigin: origin(input.SITE_AGENT_CLOUD_URL, "SITE_AGENT_CLOUD_URL", nodeEnvironment),
    captiveOrigin: origin(
      input.SITE_AGENT_CAPTIVE_ORIGIN,
      "SITE_AGENT_CAPTIVE_ORIGIN",
      nodeEnvironment,
    ),
    databasePath,
    storageKey: base64(input.SITE_AGENT_STORAGE_KEY_BASE64, "SITE_AGENT_STORAGE_KEY_BASE64", 32),
    commandSigningPublicKeyDer,
    healthHost,
    healthPort: integer(input.SITE_AGENT_HEALTH_PORT, 3004, 1, 65_535, "SITE_AGENT_HEALTH_PORT"),
    pollIntervalMs: integer(
      input.SITE_AGENT_POLL_INTERVAL_MS,
      5_000,
      1_000,
      300_000,
      "SITE_AGENT_POLL_INTERVAL_MS",
    ),
    heartbeatIntervalMs: integer(
      input.SITE_AGENT_HEARTBEAT_INTERVAL_MS,
      30_000,
      5_000,
      900_000,
      "SITE_AGENT_HEARTBEAT_INTERVAL_MS",
    ),
    cloudTimeoutMs: integer(
      input.SITE_AGENT_CLOUD_TIMEOUT_MS,
      8_000,
      500,
      60_000,
      "SITE_AGENT_CLOUD_TIMEOUT_MS",
    ),
    shutdownTimeoutMs: integer(
      input.SITE_AGENT_SHUTDOWN_TIMEOUT_MS,
      15_000,
      1_000,
      120_000,
      "SITE_AGENT_SHUTDOWN_TIMEOUT_MS",
    ),
    maxCommandsPerPoll: integer(
      input.SITE_AGENT_MAX_COMMANDS_PER_POLL,
      10,
      1,
      100,
      "SITE_AGENT_MAX_COMMANDS_PER_POLL",
    ),
    commandClockSkewMs: integer(
      input.SITE_AGENT_COMMAND_CLOCK_SKEW_MS,
      30_000,
      0,
      300_000,
      "SITE_AGENT_COMMAND_CLOCK_SKEW_MS",
    ),
    commandMaxTtlMs: integer(
      input.SITE_AGENT_COMMAND_MAX_TTL_MS,
      600_000,
      1_000,
      3_600_000,
      "SITE_AGENT_COMMAND_MAX_TTL_MS",
    ),
    readinessMaxCloudStalenessMs: integer(
      input.SITE_AGENT_READINESS_MAX_CLOUD_STALENESS_MS,
      120_000,
      5_000,
      3_600_000,
      "SITE_AGENT_READINESS_MAX_CLOUD_STALENESS_MS",
    ),
    backoffBaseMs: integer(
      input.SITE_AGENT_BACKOFF_BASE_MS,
      1_000,
      100,
      60_000,
      "SITE_AGENT_BACKOFF_BASE_MS",
    ),
    backoffMaxMs: integer(
      input.SITE_AGENT_BACKOFF_MAX_MS,
      60_000,
      1_000,
      900_000,
      "SITE_AGENT_BACKOFF_MAX_MS",
    ),
    logLevel,
    buildSha,
    ...(parsedEnrollmentToken === undefined ? {} : { enrollmentToken: parsedEnrollmentToken }),
  };

  if (environment.backoffBaseMs > environment.backoffMaxMs) {
    throw new TypeError("SITE_AGENT_BACKOFF_BASE_MS must not exceed SITE_AGENT_BACKOFF_MAX_MS");
  }
  if (environment.pollIntervalMs >= environment.readinessMaxCloudStalenessMs) {
    throw new TypeError(
      "SITE_AGENT_POLL_INTERVAL_MS must be lower than SITE_AGENT_READINESS_MAX_CLOUD_STALENESS_MS",
    );
  }
  if (environment.shutdownTimeoutMs < environment.cloudTimeoutMs) {
    throw new TypeError(
      "SITE_AGENT_SHUTDOWN_TIMEOUT_MS must be greater than or equal to SITE_AGENT_CLOUD_TIMEOUT_MS",
    );
  }

  return environment;
}
