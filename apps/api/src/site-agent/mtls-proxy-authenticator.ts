import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppEnvironment } from "../config/environment.js";
import type { SiteAgentPrincipal } from "./site-agent.contracts.js";

const AGENT_SAN_PREFIX = "urn:entelsat:wifi:agent:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function singleHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return typeof value === "string" ? value : undefined;
}

@Injectable()
export class MtlsProxyAuthenticator {
  readonly #mode: AppEnvironment["SITE_AGENT_MTLS_PROXY_MODE"];
  readonly #sharedSecret: Buffer | undefined;

  constructor(config: ConfigService<AppEnvironment, true>) {
    this.#mode = config.get("SITE_AGENT_MTLS_PROXY_MODE", { infer: true });
    const encoded = config.get("SITE_AGENT_MTLS_PROXY_SHARED_SECRET_BASE64", { infer: true });
    this.#sharedSecret = encoded ? Buffer.from(encoded, "base64url") : undefined;
  }

  get ready(): boolean {
    return this.#mode === "shared-secret" && this.#sharedSecret?.byteLength === 32;
  }

  authenticate(headers: IncomingHttpHeaders): SiteAgentPrincipal {
    if (!this.ready || !this.#sharedSecret) {
      throw new ServiceUnavailableException({
        message: "La confianza mTLS del proxy del agente no está configurada",
        code: "SITE_AGENT_MTLS_PROXY_NOT_CONFIGURED",
      });
    }

    const suppliedSecret = singleHeader(headers, "x-entelsat-mtls-proxy-secret");
    let decodedSecret: Buffer;
    try {
      decodedSecret = Buffer.from(suppliedSecret ?? "", "base64url");
    } catch {
      throw new UnauthorizedException("Identidad de agente no válida");
    }
    if (
      decodedSecret.byteLength !== this.#sharedSecret.byteLength ||
      !timingSafeEqual(decodedSecret, this.#sharedSecret)
    ) {
      throw new UnauthorizedException("Identidad de agente no válida");
    }
    if (singleHeader(headers, "x-entelsat-client-cert-verified") !== "SUCCESS") {
      throw new UnauthorizedException("Identidad de agente no válida");
    }

    const san = singleHeader(headers, "x-entelsat-client-cert-san");
    const fingerprint = singleHeader(headers, "x-entelsat-client-cert-fingerprint-sha256");
    if (!san?.startsWith(AGENT_SAN_PREFIX) || !fingerprint) {
      throw new UnauthorizedException("Identidad de agente no válida");
    }
    const identityId = san.slice(AGENT_SAN_PREFIX.length);
    if (!UUID_PATTERN.test(identityId) || !/^[0-9a-f]{64}$/i.test(fingerprint)) {
      throw new UnauthorizedException("Identidad de agente no válida");
    }
    return {
      identityId: identityId.toLowerCase(),
      certificateFingerprintSha256: fingerprint.toLowerCase(),
      subjectAlternativeName: san,
    };
  }
}
