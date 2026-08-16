import {
  AGENT_PROTOCOL_VERSION,
  type AgentIdentityMaterial,
  type AgentOutboxEvent,
  type CommandLeaseResponse,
  type EnrollmentRequest,
  type EnrollmentResponse,
  type SignedAgentCommand,
} from "../contracts.js";
import type { AgentCloudPort, EnrollmentCloudPort } from "./cloud-port.js";

export interface MockEnrollmentGrant {
  readonly token: string;
  readonly issue: (request: EnrollmentRequest) => EnrollmentResponse;
}

export class InMemoryMockCloud implements EnrollmentCloudPort, AgentCloudPort {
  readonly #grants = new Map<string, MockEnrollmentGrant>();
  readonly #consumedTokens = new Set<string>();
  readonly #commands: SignedAgentCommand[] = [];
  readonly events: AgentOutboxEvent[] = [];

  constructor(grants: readonly MockEnrollmentGrant[] = []) {
    for (const grant of grants) {
      this.#grants.set(grant.token, grant);
    }
  }

  addCommand(command: SignedAgentCommand): void {
    this.#commands.push(command);
  }

  async enroll(request: EnrollmentRequest, oneTimeToken: string): Promise<EnrollmentResponse> {
    const grant = this.#grants.get(oneTimeToken);
    if (!grant || this.#consumedTokens.has(oneTimeToken)) {
      throw new Error("Enrollment grant is invalid, expired or already consumed");
    }
    this.#consumedTokens.add(oneTimeToken);
    return grant.issue(request);
  }

  async leaseCommands(
    identity: AgentIdentityMaterial,
    afterSequence: number,
    maximumCommands: number,
  ): Promise<CommandLeaseResponse> {
    return {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      commands: this.#commands
        .filter(
          (command) =>
            command.tenantId === identity.tenantId &&
            command.gatewayId === identity.gatewayId &&
            command.sequence > afterSequence,
        )
        .sort((left, right) => left.sequence - right.sequence)
        .slice(0, maximumCommands),
    };
  }

  async publishEvent(_identity: AgentIdentityMaterial, event: AgentOutboxEvent): Promise<void> {
    if (!this.events.some((existing) => existing.id === event.id)) {
      this.events.push(event);
    }
  }
}
