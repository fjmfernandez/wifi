import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createLogger } from "../logging/logger.js";
import type { SignedAgentCommand, UnsignedAgentCommand } from "../contracts.js";
import { canonicalJson, CommandSignatureVerifier } from "./command-signature.js";
import { CryptoVault } from "./crypto-vault.js";

describe("site-agent security primitives", () => {
  it("encrypts durable values with context-bound authenticated encryption", () => {
    const vault = new CryptoVault(randomBytes(32));
    const envelope = vault.encrypt("router-password-never-clear", "identity:one");
    expect(envelope).not.toContain("router-password-never-clear");
    expect(vault.decrypt(envelope, "identity:one")).toBe("router-password-never-clear");
    expect(() => vault.decrypt(envelope, "identity:other")).toThrow();
  });

  it("verifies canonical Ed25519 commands and rejects tampering", () => {
    const keyPair = generateKeyPairSync("ed25519");
    const unsigned: UnsignedAgentCommand = {
      protocolVersion: 1,
      id: "0198a000-0000-7000-8000-000000000101",
      tenantId: "0198a000-0000-7000-8000-000000000001",
      gatewayId: "0198a000-0000-7000-8000-000000000021",
      sequence: 1,
      type: "gateway.inventory.read",
      issuedAt: "2026-08-16T10:00:00.000Z",
      expiresAt: "2026-08-16T10:05:00.000Z",
      payload: {},
    };
    const command: SignedAgentCommand = {
      ...unsigned,
      signature: sign(null, Buffer.from(canonicalJson(unsigned)), keyPair.privateKey).toString(
        "base64",
      ),
    };
    const publicDer = keyPair.publicKey.export({ format: "der", type: "spki" });
    const verifier = new CommandSignatureVerifier(publicDer);
    expect(verifier.verify(command)).toBe(true);
    expect(verifier.verify({ ...command, sequence: 2 })).toBe(false);
  });

  it("redacts sensitive fields without serializing error messages", () => {
    const lines: string[] = [];
    const logger = createLogger(
      { logLevel: "debug", buildSha: "1234567", nodeEnvironment: "test" },
      (line) => lines.push(line),
      () => new Date("2026-08-16T10:00:00.000Z"),
    );
    logger.info("test", {
      enrollment_token: "do-not-print",
      commandId: "safe-id",
      certificate: "do-not-print-either",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("do-not-print");
    expect(lines[0]).toContain("[REDACTED]");
    expect(lines[0]).toContain("safe-id");
  });
});
