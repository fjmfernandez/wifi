import { createPrivateKey, sign, type KeyObject } from "node:crypto";

import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppEnvironment } from "../config/environment.js";
import type { SignedAgentCommand, UnsignedAgentCommand } from "./site-agent.contracts.js";

function canonicalSerialize(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Signed content contains a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Signed content cannot be cyclic");
    seen.add(value);
    const serialized = `[${value.map((item) => canonicalSerialize(item, seen)).join(",")}]`;
    seen.delete(value);
    return serialized;
  }
  if (typeof value === "object") {
    if (seen.has(value)) throw new TypeError("Signed content cannot be cyclic");
    seen.add(value);
    const record = value as Record<string, unknown>;
    const serialized = `{${Object.keys(record)
      .sort()
      .map((key) => {
        const item = record[key];
        if (item === undefined) throw new TypeError("Signed content cannot contain undefined");
        return `${JSON.stringify(key)}:${canonicalSerialize(item, seen)}`;
      })
      .join(",")}}`;
    seen.delete(value);
    return serialized;
  }
  throw new TypeError("Signed content contains an unsupported value");
}

export function canonicalAgentJson(value: unknown): string {
  return canonicalSerialize(value, new WeakSet<object>());
}

@Injectable()
export class SiteAgentCommandSigner {
  readonly #privateKey: KeyObject | undefined;

  constructor(config: ConfigService<AppEnvironment, true>) {
    const mode = config.get("SITE_AGENT_COMMAND_SIGNING_MODE", { infer: true });
    const encoded = config.get("SITE_AGENT_COMMAND_SIGNING_PRIVATE_KEY_BASE64", { infer: true });
    if (mode !== "ed25519" || !encoded) {
      this.#privateKey = undefined;
      return;
    }
    const key = createPrivateKey({
      key: Buffer.from(encoded, "base64"),
      format: "der",
      type: "pkcs8",
    });
    if (key.asymmetricKeyType !== "ed25519") {
      throw new TypeError("SITE_AGENT_COMMAND_SIGNING_PRIVATE_KEY_BASE64 must be Ed25519");
    }
    this.#privateKey = key;
  }

  get ready(): boolean {
    return this.#privateKey !== undefined;
  }

  sign(command: UnsignedAgentCommand): SignedAgentCommand {
    if (!this.#privateKey) {
      throw new ServiceUnavailableException({
        message: "La firma de comandos del agente no está configurada",
        code: "SITE_AGENT_COMMAND_SIGNING_NOT_CONFIGURED",
      });
    }
    if (command.type === "provisioning.apply") {
      throw new ServiceUnavailableException({
        message: "La aplicación física está bloqueada hasta validar RouterBOARD en laboratorio",
        code: "BLOCKED_BY_LAB_VALIDATION",
      });
    }
    return {
      ...command,
      signature: sign(
        null,
        Buffer.from(canonicalAgentJson(command), "utf8"),
        this.#privateKey,
      ).toString("base64"),
    };
  }
}
