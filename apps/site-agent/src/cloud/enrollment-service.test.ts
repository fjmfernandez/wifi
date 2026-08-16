import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CertificateVerifier } from "../security/certificate-verifier.js";
import { CryptoVault } from "../security/crypto-vault.js";
import { SqliteStore } from "../storage/sqlite-store.js";
import { InMemoryMockCloud } from "./mock-cloud.js";
import { EnrollmentService } from "./enrollment-service.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("one-use enrollment", () => {
  it("generates the private key locally, verifies the certificate and refuses local replay", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wifi-agent-enroll-"));
    directories.push(directory);
    const store = new SqliteStore(
      join(directory, "agent.sqlite"),
      new CryptoVault(randomBytes(32)),
    );
    const token = "enrollment_token_abcdefghijklmnopqrstuvwxyz0123456789";
    const cloud = new InMemoryMockCloud([
      {
        token,
        issue: (request) => ({
          protocolVersion: 1,
          identityId: "0198a000-0000-7000-8000-000000000011",
          tenantId: "0198a000-0000-7000-8000-000000000001",
          gatewayId: "0198a000-0000-7000-8000-000000000021",
          certificatePem: `-----BEGIN CERTIFICATE-----\n${request.publicKeySpkiBase64}\n${"A".repeat(64)}\n-----END CERTIFICATE-----`,
          caCertificatePem: `-----BEGIN CERTIFICATE-----\n${"B".repeat(80)}\n-----END CERTIFICATE-----`,
          certificateNotAfter: "2027-08-16T10:00:00.000Z",
          initialCommandSequence: 0,
        }),
      },
    ]);
    const verify = vi.fn();
    const certificateVerifier: CertificateVerifier = { verify };
    const service = new EnrollmentService(
      cloud,
      store,
      certificateVerifier,
      () => new Date("2026-08-16T10:00:00.000Z"),
    );

    const enrolled = await service.enroll(token);
    expect(enrolled.privateKeyPem).toContain("PRIVATE KEY");
    expect(verify).toHaveBeenCalledOnce();
    expect(store.loadIdentity()?.gatewayId).toBe(enrolled.gatewayId);
    await expect(service.enroll(token)).rejects.toThrow(/already enrolled/);
    store.close();
  });

  it("consumes a mock cloud grant exactly once", async () => {
    const token = "enrollment_token_abcdefghijklmnopqrstuvwxyz0123456789";
    const response = {
      protocolVersion: 1 as const,
      identityId: "0198a000-0000-7000-8000-000000000011",
      tenantId: "0198a000-0000-7000-8000-000000000001",
      gatewayId: "0198a000-0000-7000-8000-000000000021",
      certificatePem: `-----BEGIN CERTIFICATE-----\n${"A".repeat(80)}\n-----END CERTIFICATE-----`,
      caCertificatePem: `-----BEGIN CERTIFICATE-----\n${"B".repeat(80)}\n-----END CERTIFICATE-----`,
      certificateNotAfter: "2027-08-16T10:00:00.000Z",
      initialCommandSequence: 0,
    };
    const cloud = new InMemoryMockCloud([{ token, issue: () => response }]);
    const request = {
      protocolVersion: 1 as const,
      agentVersion: "0.1.0",
      hostname: "agent",
      publicKeySpkiBase64: randomBytes(64).toString("base64"),
      nonce: randomBytes(32).toString("base64url"),
      capabilities: ["inventory.read", "provisioning.preview"] as const,
    };
    await expect(cloud.enroll(request, token)).resolves.toEqual(response);
    await expect(cloud.enroll(request, token)).rejects.toThrow(/consumed/);
  });
});
