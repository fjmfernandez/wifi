import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";

export const SITE_AGENT_CERTIFICATE_ISSUER = Symbol("SITE_AGENT_CERTIFICATE_ISSUER");

export interface CertificateIssueRequest {
  readonly identityId: string;
  readonly tenantId: string;
  readonly gatewayId: string;
  readonly publicKeySpkiDer: Uint8Array;
  readonly subjectAlternativeName: string;
  readonly notBefore: Date;
  readonly notAfter: Date;
}

export interface IssuedAgentCertificate {
  readonly certificatePem: string;
  readonly caCertificatePem: string;
  readonly fingerprintSha256: string;
  readonly subjectAlternativeName: string;
  readonly notAfter: Date;
}

export interface SiteAgentCertificateIssuer {
  readonly ready: boolean;
  readonly status: string;
  issue(request: CertificateIssueRequest): Promise<IssuedAgentCertificate>;
}

@Injectable()
export class BlockedCertificateIssuer implements SiteAgentCertificateIssuer {
  readonly ready = false;
  readonly status = "SITE_AGENT_PKI_NOT_CONFIGURED";

  async issue(_request: CertificateIssueRequest): Promise<IssuedAgentCertificate> {
    throw new ServiceUnavailableException({
      message: "La PKI del agente de sede no está configurada",
      code: this.status,
    });
  }
}

@Injectable()
export class CertificateIssuerReadiness {
  constructor(
    @Inject(SITE_AGENT_CERTIFICATE_ISSUER)
    readonly issuer: SiteAgentCertificateIssuer,
  ) {}
}
