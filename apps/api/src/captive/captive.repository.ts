import type {
  CaptiveAuthorize,
  CaptiveAuthorizationResult,
  CaptiveLegalDocument,
  CaptiveLegalVersionRef,
  LoginMethod,
} from "@wifi/contracts";

export const CAPTIVE_REPOSITORY = Symbol("CAPTIVE_REPOSITORY");

export interface CaptiveGatewayContext {
  tenantId: string;
  gatewayId: string;
  siteId: string;
  siteName: string;
  nasIdentifier: string;
  legalVersionId: string;
  legalVersions: readonly CaptiveLegalVersionRef[];
  allowedLoginOrigins: readonly string[];
  availableMethods: readonly LoginMethod[];
  portal?: {
    name: string;
    headline: string;
    body: string;
    logoUrl?: string;
    primaryColor?: string;
  };
}

export interface CaptiveGatewaySeen {
  gatewayId: string;
  nasIdentifier: string;
}

export interface PendingCaptiveAttempt {
  stateDigest: Buffer;
  nonceDigest: Buffer;
  gateway: CaptiveGatewayContext;
  macDigest: Buffer;
  normalizedMac?: string;
  ipDigest: Buffer;
  linkLogin: string;
  linkOrig?: string;
  expiresAt: Date;
}

export interface CaptiveRepository {
  resolveGateway(locatorDigest: Buffer): Promise<CaptiveGatewayContext | undefined>;
  markGatewaySeen(locatorDigest: Buffer): Promise<CaptiveGatewaySeen | undefined>;
  createAttempt(attempt: PendingCaptiveAttempt): Promise<void>;
  getAttempt(stateDigest: Buffer): Promise<PendingCaptiveAttempt | undefined>;
  getLegalDocument(
    tenantId: string,
    siteName: string,
    legalVersionId: string,
    locale: "es" | "en",
  ): Promise<CaptiveLegalDocument | undefined>;
  issueAuthorization(
    stateDigest: Buffer,
    request: CaptiveAuthorize,
    credential: { username: string; password: string; expiresAt: Date },
  ): Promise<CaptiveAuthorizationResult>;
}
