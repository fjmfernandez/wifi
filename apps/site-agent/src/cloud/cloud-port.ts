import type {
  AgentIdentityMaterial,
  AgentOutboxEvent,
  CommandLeaseResponse,
  EnrollmentRequest,
  EnrollmentResponse,
} from "../contracts.js";

export interface EnrollmentCloudPort {
  enroll(request: EnrollmentRequest, oneTimeToken: string): Promise<EnrollmentResponse>;
}

export interface AgentCloudPort {
  leaseCommands(
    identity: AgentIdentityMaterial,
    afterSequence: number,
    maximumCommands: number,
  ): Promise<CommandLeaseResponse>;
  publishEvent(identity: AgentIdentityMaterial, event: AgentOutboxEvent): Promise<void>;
}
