import { Injectable } from "@nestjs/common";
import type {
  CaptiveAuthorize,
  CaptiveAuthorizationResult,
  CaptiveLegalDocument,
  Locale,
} from "@wifi/contracts";
import { constantTimeEqual, keyedDigest } from "@wifi/security";

import type {
  CaptiveGatewaySeen,
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
  es: "La red se ofrece para proporcionar acceso a Internet durante la estancia. No se permite utilizarla para actividades ilícitas, interferir con otros usuarios o eludir las medidas de seguridad. Al aceptar estas condiciones, autorizas que el establecimiento pueda enviarte ofertas, ventajas y comunicaciones comerciales relacionadas con sus servicios.",
  en: "The network is provided for Internet access during the stay. It must not be used for unlawful activity, interference with other users, or circumvention of security controls. By accepting these terms, you authorize the venue to send you offers, benefits and commercial communications related to its services.",
  de: "Das WLAN wird bereitgestellt, um während Ihres Aufenthalts Internetzugang zu ermöglichen. Es darf nicht für rechtswidrige Aktivitäten, zur Störung anderer Nutzer oder zur Umgehung von Sicherheitsmaßnahmen verwendet werden. Mit der Annahme dieser Bedingungen stimmen Sie zu, dass der Betrieb Ihnen Angebote, Vorteile und kommerzielle Mitteilungen im Zusammenhang mit seinen Dienstleistungen senden darf.",
  fr: "Le réseau WiFi est fourni afin de permettre l’accès à Internet pendant votre séjour. Il ne doit pas être utilisé pour des activités illicites, pour perturber d’autres utilisateurs ou pour contourner les mesures de sécurité. En acceptant ces conditions, vous autorisez l’établissement à vous envoyer des offres, avantages et communications commerciales liées à ses services.",
  ar: "يتم توفير شبكة WiFi لإتاحة الوصول إلى الإنترنت أثناء إقامتك. لا يجوز استخدامها في أنشطة غير قانونية أو للتأثير على المستخدمين الآخرين أو لتجاوز إجراءات الأمان. بقبول هذه الشروط، فإنك تسمح للمنشأة بإرسال عروض ومزايا ورسائل تجارية متعلقة بخدماتها.",
} as const;

const demoLegalVersionIds: Record<Locale, string> = {
  es: ids.legalVersionId,
  en: "0198be3c-70f4-7a10-9fc4-3f2f48a01005",
  de: "0198be3c-70f4-7a10-9fc4-3f2f48a01006",
  fr: "0198be3c-70f4-7a10-9fc4-3f2f48a01007",
  ar: "0198be3c-70f4-7a10-9fc4-3f2f48a01008",
};

const demoLegalTitles: Record<Locale, string> = {
  es: "Condiciones de uso y privacidad",
  en: "Terms of use and privacy",
  de: "Nutzungsbedingungen und Datenschutz",
  fr: "Conditions d’utilisation et confidentialité",
  ar: "شروط الاستخدام والخصوصية",
};

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
      siteName: "Entelsat",
      nasIdentifier: "gateway-casa",
      legalVersions: Object.entries(demoLegalVersionIds).map(([locale, id]) => ({
        id,
        locale: locale as Locale,
      })),
      allowedLoginOrigins: ["https://hotspot.local", "http://hotspot.local"],
      availableMethods: ["email", "voucher"],
    };
  }

  async markGatewaySeen(locatorDigest: Buffer): Promise<CaptiveGatewaySeen | undefined> {
    const gateway = await this.resolveGateway(locatorDigest);
    if (!gateway) return undefined;
    return { gatewayId: gateway.gatewayId, nasIdentifier: gateway.nasIdentifier };
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
    locale: Locale,
  ): Promise<CaptiveLegalDocument | undefined> {
    const expectedId = demoLegalVersionIds[locale];
    if (tenantId !== ids.tenantId || legalVersionId !== expectedId) return undefined;
    return {
      id: expectedId,
      siteName,
      title: demoLegalTitles[locale],
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
