import { createHash } from "node:crypto";

import type { AgentIdentityMaterial, SignedAgentCommand } from "../contracts.js";
import { canonicalJson } from "../security/command-signature.js";
import type { CommandSignatureVerifier } from "../security/command-signature.js";

export interface GuardedCommand {
  readonly command: SignedAgentCommand;
  readonly digest: string;
  readonly expired: boolean;
}

export class CommandRejectedError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "CommandRejectedError";
  }
}

export class CommandGuard {
  constructor(
    private readonly signatureVerifier: CommandSignatureVerifier,
    private readonly clockSkewMs: number,
    private readonly maximumTtlMs: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  guard(command: SignedAgentCommand, identity: AgentIdentityMaterial): GuardedCommand {
    if (!this.signatureVerifier.verify(command)) {
      throw new CommandRejectedError("Command signature is invalid", "COMMAND_SIGNATURE_INVALID");
    }
    if (command.tenantId !== identity.tenantId || command.gatewayId !== identity.gatewayId) {
      throw new CommandRejectedError(
        "Command is scoped to another identity",
        "COMMAND_SCOPE_INVALID",
      );
    }

    const issuedAt = Date.parse(command.issuedAt);
    const expiresAt = Date.parse(command.expiresAt);
    const now = this.now().getTime();
    if (expiresAt <= issuedAt || expiresAt - issuedAt > this.maximumTtlMs) {
      throw new CommandRejectedError("Command validity window is invalid", "COMMAND_TTL_INVALID");
    }
    if (issuedAt > now + this.clockSkewMs) {
      throw new CommandRejectedError(
        "Command was issued too far in the future",
        "COMMAND_NOT_YET_VALID",
      );
    }

    return {
      command,
      digest: createHash("sha256").update(canonicalJson(command)).digest("hex"),
      expired: expiresAt <= now,
    };
  }
}
