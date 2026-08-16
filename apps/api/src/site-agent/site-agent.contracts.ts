import { z } from "zod";

export const SITE_AGENT_PROTOCOL_VERSION = 1 as const;

const idSchema = z.string().uuid();
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);
const safeCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/);

export const enrollmentRequestSchema = z
  .object({
    protocolVersion: z.literal(SITE_AGENT_PROTOCOL_VERSION),
    agentVersion: z
      .string()
      .min(1)
      .max(32)
      .regex(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/),
    hostname: z
      .string()
      .min(1)
      .max(63)
      .regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/),
    publicKeySpkiBase64: z.string().min(64).max(2_048),
    nonce: z
      .string()
      .min(43)
      .max(86)
      .regex(/^[A-Za-z0-9_-]+$/),
    capabilities: z.tuple([z.literal("inventory.read"), z.literal("provisioning.preview")]),
  })
  .strict();
export type EnrollmentRequest = z.infer<typeof enrollmentRequestSchema>;

export const enrollmentResponseSchema = z
  .object({
    protocolVersion: z.literal(SITE_AGENT_PROTOCOL_VERSION),
    identityId: idSchema,
    tenantId: idSchema,
    gatewayId: idSchema,
    certificatePem: z.string().min(64).max(32_768),
    caCertificatePem: z.string().min(64).max(32_768),
    certificateNotAfter: isoDateTimeSchema,
    initialCommandSequence: z.number().int().nonnegative().safe(),
  })
  .strict();
export type EnrollmentResponse = z.infer<typeof enrollmentResponseSchema>;

export const commandTypeSchema = z.enum([
  "gateway.inventory.read",
  "provisioning.preflight",
  "provisioning.preview",
  "provisioning.apply",
]);
export type SiteAgentCommandType = z.infer<typeof commandTypeSchema>;

export const unsignedAgentCommandSchema = z
  .object({
    protocolVersion: z.literal(SITE_AGENT_PROTOCOL_VERSION),
    id: idSchema,
    tenantId: idSchema,
    gatewayId: idSchema,
    sequence: z.number().int().nonnegative().safe(),
    type: commandTypeSchema,
    issuedAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema,
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export type UnsignedAgentCommand = z.infer<typeof unsignedAgentCommandSchema>;

export const signedAgentCommandSchema = unsignedAgentCommandSchema.extend({
  signature: z.string().min(4).max(1_024),
});
export type SignedAgentCommand = z.infer<typeof signedAgentCommandSchema>;

export const commandLeaseRequestSchema = z
  .object({
    protocolVersion: z.literal(SITE_AGENT_PROTOCOL_VERSION),
    identityId: idSchema,
    gatewayId: idSchema,
    afterSequence: z.number().int().nonnegative().safe(),
    maximumCommands: z.number().int().min(1).max(100),
  })
  .strict();
export type CommandLeaseRequest = z.infer<typeof commandLeaseRequestSchema>;

export const commandLeaseResponseSchema = z
  .object({
    protocolVersion: z.literal(SITE_AGENT_PROTOCOL_VERSION),
    commands: z.array(signedAgentCommandSchema).max(100),
  })
  .strict();
export type CommandLeaseResponse = z.infer<typeof commandLeaseResponseSchema>;

const commandOutcomeSchema = z
  .object({
    commandId: idSchema,
    commandSequence: z.number().int().nonnegative().safe(),
    status: z.enum(["succeeded", "rejected", "blocked", "failed"]),
    code: safeCodeSchema,
    completedAt: isoDateTimeSchema,
    evidence: z.record(z.string(), z.unknown()),
  })
  .strict();

const eventEnvelope = {
  id: idSchema,
  protocolVersion: z.literal(SITE_AGENT_PROTOCOL_VERSION),
  identityId: idSchema,
  tenantId: idSchema,
  gatewayId: idSchema,
  occurredAt: isoDateTimeSchema,
} as const;

export const heartbeatEventSchema = z
  .object({
    ...eventEnvelope,
    type: z.literal("agent.heartbeat"),
    payload: z
      .object({
        agentVersion: z.string().min(1).max(32),
        buildSha: z.string().min(7).max(64),
        mode: z.literal("preview_only"),
        applyStatus: z.literal("BLOCKED_BY_LAB_VALIDATION"),
        pendingCommands: z.number().int().nonnegative().safe(),
        pendingOutboxEvents: z.number().int().nonnegative().safe(),
      })
      .strict(),
  })
  .strict();

export const commandResultEventSchema = z
  .object({
    ...eventEnvelope,
    type: z.literal("agent.command-result"),
    payload: z.object({ outcome: commandOutcomeSchema }).strict(),
  })
  .strict();

export const siteAgentEventSchema = z.discriminatedUnion("type", [
  heartbeatEventSchema,
  commandResultEventSchema,
]);
export type SiteAgentEvent = z.infer<typeof siteAgentEventSchema>;

export const eventAckSchema = z
  .object({
    status: z.enum(["accepted", "duplicate"]),
    eventId: idSchema,
  })
  .strict();
export type EventAck = z.infer<typeof eventAckSchema>;

export interface SiteAgentPrincipal {
  readonly identityId: string;
  readonly certificateFingerprintSha256: z.infer<typeof sha256HexSchema>;
  readonly subjectAlternativeName: string;
}

export { sha256HexSchema };
