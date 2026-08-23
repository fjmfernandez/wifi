import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  captiveAuthorizeSchema,
  captiveLegalDocumentSchema,
  captiveStartSchema,
  idSchema,
  type CaptiveAuthorizationResult,
  type CaptiveLegalDocument,
} from "@wifi/contracts";
import { deriveScopedKey, generateOpaqueToken, keyedDigest } from "@wifi/security";
import { z } from "zod";

import type { AppEnvironment } from "../config/environment.js";
import {
  CAPTIVE_REPOSITORY,
  type CaptiveGatewayContext,
  type CaptiveRepository,
} from "./captive.repository.js";
import { DemoCaptiveRepository } from "./demo-captive.repository.js";

export interface CaptiveStartResult {
  portalUrl: string;
  expiresAt: string;
}

export interface CaptivePublicContext {
  siteName: string;
  legalVersionId: string;
  legalVersions: CaptiveGatewayContext["legalVersions"];
  availableMethods: CaptiveGatewayContext["availableMethods"];
  languages: readonly ("es" | "en")[];
  portal?: CaptiveGatewayContext["portal"];
}

export interface CaptiveGatewayPingResult {
  status: "linked";
  gatewayId: string;
  nasIdentifier: string;
  seenAt: string;
}

function normalizedOrigin(value: string): string {
  const url = new URL(value);
  return url.origin.toLowerCase();
}

@Injectable()
export class CaptiveService {
  private readonly stateKey: Buffer;
  private readonly identifierKey: Buffer;
  private readonly portalOrigin: string;

  constructor(
    @Inject(CAPTIVE_REPOSITORY) private readonly repository: CaptiveRepository,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.stateKey = Buffer.from(
      config.getOrThrow<string>("CAPTIVE_STATE_HMAC_KEY_BASE64"),
      "base64url",
    );
    this.identifierKey = Buffer.from(
      config.getOrThrow<string>("CAPTIVE_IDENTIFIER_HMAC_KEY_BASE64"),
      "base64url",
    );
    this.portalOrigin = config.getOrThrow<string>("CAPTIVE_PUBLIC_ORIGIN");
    if (repository instanceof DemoCaptiveRepository) {
      repository.configure(
        keyedDigest("demo-gateway-locator-2026", this.identifierKey, "captive.gateway-locator.v1"),
        this.identifierKey,
      );
    }
  }

  async start(rawRequest: unknown): Promise<CaptiveStartResult> {
    const request = captiveStartSchema.parse(rawRequest);
    const locatorDigest = keyedDigest(
      request.gatewayLocator,
      this.identifierKey,
      "captive.gateway-locator.v1",
    );
    const gateway = await this.repository.resolveGateway(locatorDigest);
    if (!gateway) throw new NotFoundException("Gateway cautivo no reconocido");

    if (!gateway.allowedLoginOrigins.includes(normalizedOrigin(request.linkLogin))) {
      throw new BadRequestException("El destino de login no pertenece al gateway registrado");
    }

    const state = generateOpaqueToken(32);
    const stateDigest = keyedDigest(state, this.stateKey, "captive.state.v1");
    const tenantIdentifierKey = deriveScopedKey(
      this.identifierKey,
      gateway.tenantId,
      "captive-identifiers",
    );
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    await this.repository.createAttempt({
      stateDigest,
      nonceDigest: keyedDigest(generateOpaqueToken(32), this.stateKey, "captive.nonce.v1"),
      gateway,
      macDigest: keyedDigest(request.mac, tenantIdentifierKey, "captive.mac.v1"),
      normalizedMac: request.mac,
      ipDigest: keyedDigest(request.ip, tenantIdentifierKey, "captive.ip.v1"),
      linkLogin: request.linkLogin,
      ...(request.linkOrig ? { linkOrig: request.linkOrig } : {}),
      expiresAt,
    });
    const portalUrl = new URL("/", this.portalOrigin);
    portalUrl.searchParams.set("state", state);
    return { portalUrl: portalUrl.toString(), expiresAt: expiresAt.toISOString() };
  }

  async gatewayPing(rawRequest: unknown): Promise<CaptiveGatewayPingResult> {
    const request = z.object({ gatewayLocator: z.string().min(16).max(256) }).parse(rawRequest);
    const gateway = await this.repository.markGatewaySeen(
      keyedDigest(request.gatewayLocator, this.identifierKey, "captive.gateway-locator.v1"),
    );
    if (!gateway) throw new NotFoundException("Gateway cautivo no reconocido");
    return {
      status: "linked",
      gatewayId: gateway.gatewayId,
      nasIdentifier: gateway.nasIdentifier,
      seenAt: new Date().toISOString(),
    };
  }

  async context(rawState: unknown): Promise<CaptivePublicContext> {
    const state = z.string().min(32).max(2048).parse(rawState);
    const attempt = await this.repository.getAttempt(
      keyedDigest(state, this.stateKey, "captive.state.v1"),
    );
    if (!attempt) throw new NotFoundException("La sesión cautiva ha caducado");
    return {
      siteName: attempt.gateway.siteName,
      legalVersionId: attempt.gateway.legalVersionId,
      legalVersions: attempt.gateway.legalVersions,
      availableMethods: attempt.gateway.availableMethods,
      languages: attempt.gateway.legalVersions.map((version) => version.locale),
      ...(attempt.gateway.portal ? { portal: attempt.gateway.portal } : {}),
    };
  }

  async legal(
    rawState: unknown,
    rawVersion: unknown,
    rawLocale: unknown,
  ): Promise<CaptiveLegalDocument> {
    const state = z.string().min(32).max(2048).parse(rawState);
    const legalVersionId = idSchema.parse(rawVersion);
    const locale = z.enum(["es", "en"]).parse(rawLocale);
    const attempt = await this.repository.getAttempt(
      keyedDigest(state, this.stateKey, "captive.state.v1"),
    );
    if (!attempt) throw new NotFoundException("La sesión cautiva ha caducado");
    const version = attempt.gateway.legalVersions.find(
      (candidate) => candidate.id === legalVersionId && candidate.locale === locale,
    );
    if (!version) throw new NotFoundException("La versión legal no está disponible");
    const document = await this.repository.getLegalDocument(
      attempt.gateway.tenantId,
      attempt.gateway.siteName,
      version.id,
      version.locale,
    );
    if (!document) throw new NotFoundException("La versión legal no está disponible");
    return captiveLegalDocumentSchema.parse(document);
  }

  async authorize(rawRequest: unknown): Promise<CaptiveAuthorizationResult> {
    const request = captiveAuthorizeSchema.parse(rawRequest);
    const stateDigest = keyedDigest(request.state, this.stateKey, "captive.state.v1");
    const attempt = await this.repository.getAttempt(stateDigest);
    if (!attempt)
      throw new UnauthorizedException("La sesión cautiva no es válida o ya fue utilizada");
    if (!attempt.gateway.availableMethods.includes(request.method)) {
      throw new BadRequestException("Método de acceso no disponible");
    }
    if (
      !attempt.gateway.legalVersions.some(
        (version) =>
          version.id === request.acceptedLegalVersionId && version.locale === request.locale,
      )
    ) {
      throw new BadRequestException("La versión legal aceptada no es la vigente");
    }

    const credential = {
      username: `cap_${generateOpaqueToken(24)}`,
      password: generateOpaqueToken(32),
      expiresAt: new Date(Date.now() + 15 * 60_000),
    };
    try {
      return await this.repository.issueAuthorization(stateDigest, request, credential);
    } catch (error) {
      if (error instanceof Error && error.message === "CAPTIVE_CREDENTIAL_INVALID") {
        throw new UnauthorizedException("Credencial de acceso no válida");
      }
      if (error instanceof Error && error.message === "CAPTIVE_STATE_INVALID") {
        throw new UnauthorizedException("La sesión cautiva no es válida o ya fue utilizada");
      }
      if (error instanceof Error && error.message === "CAPTIVE_LEGAL_VERSION_INVALID") {
        throw new BadRequestException("La versión legal aceptada ya no está vigente");
      }
      throw error;
    }
  }
}
