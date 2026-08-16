import { createPublicKey, verify } from "node:crypto";
import type { SignedAgentCommand, UnsignedAgentCommand } from "../contracts.js";

function serialize(value: unknown, seen: WeakSet<object>): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Signed content cannot contain non-finite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError("Signed content cannot be cyclic");
    }
    seen.add(value);
    const result = `[${value.map((item) => serialize(item, seen)).join(",")}]`;
    seen.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      throw new TypeError("Signed content cannot be cyclic");
    }
    seen.add(value);
    const candidate = value as Record<string, unknown>;
    const entries = Object.keys(candidate)
      .sort()
      .map((key) => {
        const item = candidate[key];
        if (item === undefined) {
          throw new TypeError("Signed content cannot contain undefined values");
        }
        return `${JSON.stringify(key)}:${serialize(item, seen)}`;
      });
    seen.delete(value);
    return `{${entries.join(",")}}`;
  }
  throw new TypeError("Signed content contains an unsupported value");
}

export function canonicalJson(value: unknown): string {
  return serialize(value, new WeakSet<object>());
}

export function unsignedCommand(command: SignedAgentCommand): UnsignedAgentCommand {
  return {
    protocolVersion: command.protocolVersion,
    id: command.id,
    tenantId: command.tenantId,
    gatewayId: command.gatewayId,
    sequence: command.sequence,
    type: command.type,
    issuedAt: command.issuedAt,
    expiresAt: command.expiresAt,
    payload: command.payload,
  };
}

export class CommandSignatureVerifier {
  readonly #publicKey: ReturnType<typeof createPublicKey>;

  constructor(publicKeyDer: Uint8Array) {
    this.#publicKey = createPublicKey({
      key: Buffer.from(publicKeyDer),
      format: "der",
      type: "spki",
    });
    if (this.#publicKey.asymmetricKeyType !== "ed25519") {
      throw new TypeError("Command signing public key must be Ed25519");
    }
  }

  verify(command: SignedAgentCommand): boolean {
    return verify(
      null,
      Buffer.from(canonicalJson(unsignedCommand(command)), "utf8"),
      this.#publicKey,
      Buffer.from(command.signature, "base64"),
    );
  }
}
