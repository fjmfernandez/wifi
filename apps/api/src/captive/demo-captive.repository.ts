import { Injectable } from "@nestjs/common";
import type {
  CaptiveAuthorize,
  CaptiveAuthorizationResult,
  CaptiveLegalDocument,
} from "@wifi/contracts";
import { constantTimeEqual, keyedDigest } from "@wifi/security";

import type {
  CaptiveGatewayContext,
  CaptiveRepository,
  PendingCaptiveAttempt,
} from "./captive.repository.js";

const ids = {
  tenantId: "0198be3c-70f4-7a10-9fc4-3f2f48a01001",
  gatewayId: "0198be3c-70f4-7a10-9fc4-3f2f48a01002",
  siteId: "0198be3c-70f4-7a10-9fc4-3f2f48a01003",
  legalVersionId: "0198be3c-70f4-7a10-9fc4-3f2f48a01004",
};

const demoLegalContent = {
  es: "La red se ofrece para proporcionar acceso a Internet durante la estancia. No se permite utilizarla para actividades ilícitas, interferir con otros usuarios o eludir las medidas de seguridad. Las comunicaciones comerciales son opcionales y requieren un consentimiento separado.",
  en: "The network is provided for Internet access during the stay. It must not be used for unlawful activity, interference with other users, or circumvention of security controls. Marketing communications are optional and require separate consent.",
} as const;

@Injectable()
export class DemoCaptiveRepository implements CaptiveRepository {
  private readonly attempts = new Map<string, PendingCaptiveAttempt & { consumedAt?: Date }>();
  private locatorDigest?: Buffer;
  private voucherKey?: Buffer;

  configure(locatorDigest: Buffer, voucherKey: Buffer): void {
    this.locatorDigest = locatorDigest;
    this.voucherKey = voucherKey;
  }

  async resolveGateway(locatorDigest: Buffer): Promise<CaptiveGatewayContext | undefined> {
    if (!this.locatorDigest || !constantTimeEqual(locatorDigest, this.locatorDigest))
      return undefined;
    return {
      ...ids,
      siteName: "Hotel Miramar Málaga",
      nasIdentifier: "nas-demo-miramar",
      legalVersions: [
        { id: ids.legalVersionId, locale: "es" },
        { id: "0198be3c-70f4-7a10-9fc4-3f2f48a01005", locale: "en" },
      ],
      allowedLoginOrigins: ["https://hotspot.local", "http://hotspot.local"],
      availableMethods: ["click", "email", "voucher"],
    };
  }

  async createAttempt(attempt: PendingCaptiveAttempt): Promise<void> {
    const key = attempt.stateDigest.toString("hex");
    if (this.attempts.has(key)) throw new Error("State digest collision");
    this.attempts.set(key, attempt);
  }

  async getAttempt(stateDigest: Buffer): Promise<PendingCaptiveAttempt | undefined> {
    const attempt = this.attempts.get(stateDigest.toString("hex"));
    if (!attempt || attempt.consumedAt || attempt.expiresAt <= new Date()) return undefined;
    return attempt;
  }

  async getLegalDocument(
    tenantId: string,
    siteName: string,
    legalVersionId: string,
    locale: "es" | "en",
  ): Promise<CaptiveLegalDocument | undefined> {
    const expectedId =
      locale === "es" ? ids.legalVersionId : "0198be3c-70f4-7a10-9fc4-3f2f48a01005";
    if (tenantId !== ids.tenantId || legalVersionId !== expectedId) return undefined;
    return {
      id: expectedId,
      siteName,
      title: locale === "es" ? "Condiciones de uso y privacidad" : "Terms of use and privacy",
      kind: "terms",
      version: 1,
      locale,
      content: demoLegalContent[locale],
      contentHash: "0".repeat(64),
      publishedAt: new Date(0).toISOString(),
    };
  }

  async issueAuthorization(
    stateDigest: Buffer,
    request: CaptiveAuthorize,
    credential: { username: string; password: string; expiresAt: Date },
  ): Promise<CaptiveAuthorizationResult> {
    const key = stateDigest.toString("hex");
    const attempt = this.attempts.get(key);
    if (!attempt || attempt.consumedAt || attempt.expiresAt <= new Date()) {
      throw new Error("CAPTIVE_STATE_INVALID");
    }
    if (request.method === "voucher") {
      const supplied = keyedDigest(request.voucher ?? "", this.voucherKey!, "demo.voucher.v1");
      const expected = keyedDigest("MIR-7K4P-9W2D", this.voucherKey!, "demo.voucher.v1");
      if (!constantTimeEqual(supplied, expected)) throw new Error("CAPTIVE_CREDENTIAL_INVALID");
    }
    attempt.consumedAt = new Date();
    return {
      authorizationId: crypto.randomUUID(),
      username: credential.username,
      password: credential.password,
      loginUrl: attempt.linkLogin,
      expiresAt: credential.expiresAt.toISOString(),
    };
  }
}
