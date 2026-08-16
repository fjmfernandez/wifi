import type {
  SiteAgentEvent,
  SiteAgentPrincipal,
  UnsignedAgentCommand,
} from "./site-agent.contracts.js";

export const SITE_AGENT_REPOSITORY = Symbol("SITE_AGENT_REPOSITORY");

export interface EnrollmentGrant {
  readonly tokenId: string;
  readonly identityId: string;
  readonly tenantId: string;
  readonly gatewayId: string;
  readonly initialCommandSequence: number;
}

export interface ActivateEnrollmentInput extends EnrollmentGrant {
  readonly tokenDigest: Uint8Array;
  readonly agentVersion: string;
  readonly hostname: string;
  readonly capabilities: readonly string[];
  readonly nonceDigest: Uint8Array;
  readonly publicKeySha256: string;
  readonly certificatePem: string;
  readonly certificateFingerprintSha256: string;
  readonly certificateSubjectAlternativeName: string;
  readonly certificateNotAfter: Date;
  readonly enrolledAt: Date;
}

export type ActivateEnrollmentResult =
  | { readonly status: "activated"; readonly initialCommandSequence: number }
  | { readonly status: "invalid_or_consumed" };

export interface LeaseCommandsInput {
  readonly principal: SiteAgentPrincipal;
  readonly gatewayId: string;
  readonly afterSequence: number;
  readonly maximumCommands: number;
  readonly leasedUntil: Date;
  readonly now: Date;
}

export type LeaseCommandsResult =
  | { readonly status: "leased"; readonly commands: readonly UnsignedAgentCommand[] }
  | { readonly status: "identity_invalid" }
  | { readonly status: "sequence_mismatch" };

export interface RecordEventInput {
  readonly principal: SiteAgentPrincipal;
  readonly event: SiteAgentEvent;
  readonly eventDigest: string;
  readonly receivedAt: Date;
}

export type RecordEventResult =
  | { readonly status: "accepted" | "duplicate" }
  | { readonly status: "conflict" }
  | { readonly status: "identity_invalid" };

export interface SiteAgentRepository {
  resolveEnrollmentGrant(tokenDigest: Uint8Array, now: Date): Promise<EnrollmentGrant | undefined>;
  activateEnrollment(input: ActivateEnrollmentInput): Promise<ActivateEnrollmentResult>;
  leaseCommands(input: LeaseCommandsInput): Promise<LeaseCommandsResult>;
  recordEvent(input: RecordEventInput): Promise<RecordEventResult>;
}
