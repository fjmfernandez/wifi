export const AGENT_PROTOCOL_VERSION = 1 as const;
export const AGENT_VERSION = "0.1.0" as const;

export const AGENT_COMMAND_TYPES = [
  "gateway.inventory.read",
  "provisioning.preflight",
  "provisioning.preview",
  "provisioning.apply",
] as const;
export type AgentCommandType = (typeof AGENT_COMMAND_TYPES)[number];

export interface EnrollmentRequest {
  readonly protocolVersion: typeof AGENT_PROTOCOL_VERSION;
  readonly agentVersion: string;
  readonly hostname: string;
  readonly publicKeySpkiBase64: string;
  readonly nonce: string;
  readonly capabilities: readonly ["inventory.read", "provisioning.preview"];
}

export interface EnrollmentResponse {
  readonly protocolVersion: typeof AGENT_PROTOCOL_VERSION;
  readonly identityId: string;
  readonly tenantId: string;
  readonly gatewayId: string;
  readonly certificatePem: string;
  readonly caCertificatePem: string;
  readonly certificateNotAfter: string;
  readonly initialCommandSequence: number;
}

export interface AgentIdentityMaterial extends EnrollmentResponse {
  readonly privateKeyPem: string;
  readonly enrolledAt: string;
}

export interface SignedAgentCommand {
  readonly protocolVersion: typeof AGENT_PROTOCOL_VERSION;
  readonly id: string;
  readonly tenantId: string;
  readonly gatewayId: string;
  readonly sequence: number;
  readonly type: AgentCommandType;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly signature: string;
}

export type UnsignedAgentCommand = Omit<SignedAgentCommand, "signature">;

export interface CommandLeaseResponse {
  readonly protocolVersion: typeof AGENT_PROTOCOL_VERSION;
  readonly commands: readonly SignedAgentCommand[];
}

export type CommandOutcomeStatus = "succeeded" | "rejected" | "blocked" | "failed";

export interface CommandOutcome {
  readonly commandId: string;
  readonly commandSequence: number;
  readonly status: CommandOutcomeStatus;
  readonly code: string;
  readonly completedAt: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export type AgentEventType = "agent.heartbeat" | "agent.command-result";

export interface AgentOutboxEvent {
  readonly id: string;
  readonly protocolVersion: typeof AGENT_PROTOCOL_VERSION;
  readonly identityId: string;
  readonly tenantId: string;
  readonly gatewayId: string;
  readonly type: AgentEventType;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface HeartbeatPayload {
  readonly agentVersion: string;
  readonly buildSha: string;
  readonly mode: "preview_only";
  readonly applyStatus: "BLOCKED_BY_LAB_VALIDATION";
  readonly pendingCommands: number;
  readonly pendingOutboxEvents: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,79}$/;

function record(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function string(value: unknown, name: string, minimum = 1, maximum = 16_384): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    throw new TypeError(`${name} must be a string between ${minimum} and ${maximum} characters`);
  }
  return value;
}

function uuid(value: unknown, name: string): string {
  const parsed = string(value, name, 36, 36);
  if (!UUID_PATTERN.test(parsed)) {
    throw new TypeError(`${name} must be a UUID`);
  }
  return parsed.toLowerCase();
}

function isoDateTime(value: unknown, name: string): string {
  const parsed = string(value, name, 20, 40);
  const milliseconds = Date.parse(parsed);
  if (!Number.isFinite(milliseconds) || !/(?:Z|[+-]\d\d:\d\d)$/.test(parsed)) {
    throw new TypeError(`${name} must be an ISO-8601 timestamp with an offset`);
  }
  return parsed;
}

function safeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return value as number;
}

function canonicalBase64(value: unknown, name: string, maximumBytes = 16_384): string {
  const parsed = string(value, name, 4, Math.ceil((maximumBytes * 4) / 3) + 4);
  const decoded = Buffer.from(parsed, "base64");
  if (
    decoded.length === 0 ||
    decoded.length > maximumBytes ||
    decoded.toString("base64") !== parsed
  ) {
    throw new TypeError(`${name} must be canonical base64`);
  }
  return parsed;
}

function protocolVersion(value: unknown): typeof AGENT_PROTOCOL_VERSION {
  if (value !== AGENT_PROTOCOL_VERSION) {
    throw new TypeError("protocolVersion is unsupported");
  }
  return value;
}

export function parseEnrollmentResponse(value: unknown): EnrollmentResponse {
  const candidate = record(value, "enrollment response");
  const certificatePem = string(candidate["certificatePem"], "certificatePem", 64, 32_768);
  const caCertificatePem = string(candidate["caCertificatePem"], "caCertificatePem", 64, 32_768);
  if (!certificatePem.includes("-----BEGIN CERTIFICATE-----")) {
    throw new TypeError("certificatePem must contain an X.509 certificate");
  }
  if (!caCertificatePem.includes("-----BEGIN CERTIFICATE-----")) {
    throw new TypeError("caCertificatePem must contain an X.509 certificate");
  }
  return {
    protocolVersion: protocolVersion(candidate["protocolVersion"]),
    identityId: uuid(candidate["identityId"], "identityId"),
    tenantId: uuid(candidate["tenantId"], "tenantId"),
    gatewayId: uuid(candidate["gatewayId"], "gatewayId"),
    certificatePem,
    caCertificatePem,
    certificateNotAfter: isoDateTime(candidate["certificateNotAfter"], "certificateNotAfter"),
    initialCommandSequence: safeInteger(
      candidate["initialCommandSequence"],
      "initialCommandSequence",
    ),
  };
}

export function parseSignedAgentCommand(value: unknown): SignedAgentCommand {
  const candidate = record(value, "command");
  const type = string(candidate["type"], "command.type", 1, 80);
  if (!(AGENT_COMMAND_TYPES as readonly string[]).includes(type)) {
    throw new TypeError("command.type is not allowlisted");
  }
  return {
    protocolVersion: protocolVersion(candidate["protocolVersion"]),
    id: uuid(candidate["id"], "command.id"),
    tenantId: uuid(candidate["tenantId"], "command.tenantId"),
    gatewayId: uuid(candidate["gatewayId"], "command.gatewayId"),
    sequence: safeInteger(candidate["sequence"], "command.sequence"),
    type: type as AgentCommandType,
    issuedAt: isoDateTime(candidate["issuedAt"], "command.issuedAt"),
    expiresAt: isoDateTime(candidate["expiresAt"], "command.expiresAt"),
    payload: record(candidate["payload"], "command.payload"),
    signature: canonicalBase64(candidate["signature"], "command.signature", 512),
  };
}

export function parseCommandLeaseResponse(value: unknown): CommandLeaseResponse {
  const candidate = record(value, "command lease response");
  if (!Array.isArray(candidate["commands"]) || candidate["commands"].length > 100) {
    throw new TypeError("command lease response must contain at most 100 commands");
  }
  return {
    protocolVersion: protocolVersion(candidate["protocolVersion"]),
    commands: candidate["commands"].map(parseSignedAgentCommand),
  };
}

export function assertSafeOutcomeCode(value: string): void {
  if (!SAFE_CODE_PATTERN.test(value)) {
    throw new TypeError("Command outcome code is not safe");
  }
}
