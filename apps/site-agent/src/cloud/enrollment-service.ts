import { generateKeyPairSync, randomBytes } from "node:crypto";
import { hostname } from "node:os";

import {
  AGENT_PROTOCOL_VERSION,
  AGENT_VERSION,
  parseEnrollmentResponse,
  type AgentIdentityMaterial,
  type EnrollmentRequest,
} from "../contracts.js";
import type { CertificateVerifier } from "../security/certificate-verifier.js";
import type { SqliteStore } from "../storage/sqlite-store.js";
import type { EnrollmentCloudPort } from "./cloud-port.js";

function safeHostname(): string {
  const normalized = hostname()
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .slice(0, 63);
  return normalized.length > 0 ? normalized : "site-agent";
}

export class EnrollmentService {
  constructor(
    private readonly cloud: EnrollmentCloudPort,
    private readonly store: SqliteStore,
    private readonly certificateVerifier: CertificateVerifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async enroll(oneTimeToken: string): Promise<AgentIdentityMaterial> {
    if (this.store.hasIdentity()) {
      throw new Error("Site agent is already enrolled; revoke it in the cloud before re-enrolling");
    }

    const keyPair = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { format: "der", type: "spki" },
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
    });
    const request: EnrollmentRequest = {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      agentVersion: AGENT_VERSION,
      hostname: safeHostname(),
      publicKeySpkiBase64: keyPair.publicKey.toString("base64"),
      nonce: randomBytes(32).toString("base64url"),
      capabilities: ["inventory.read", "provisioning.preview"],
    };
    const response = parseEnrollmentResponse(await this.cloud.enroll(request, oneTimeToken));
    this.certificateVerifier.verify(
      response.certificatePem,
      response.caCertificatePem,
      keyPair.privateKey,
      response.certificateNotAfter,
      response.identityId,
      this.now(),
    );
    const identity: AgentIdentityMaterial = {
      ...response,
      privateKeyPem: keyPair.privateKey,
      enrolledAt: this.now().toISOString(),
    };
    this.store.saveIdentity(identity);
    return identity;
  }
}
