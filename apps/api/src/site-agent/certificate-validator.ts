import { timingSafeEqual, X509Certificate } from "node:crypto";

import { Injectable } from "@nestjs/common";

import type { IssuedAgentCertificate } from "./certificate-issuer.js";

export interface ValidatedAgentCertificate {
  readonly fingerprintSha256: string;
  readonly notAfter: Date;
}

@Injectable()
export class AgentCertificateValidator {
  validate(
    issued: IssuedAgentCertificate,
    expectedPublicKeySpkiDer: Uint8Array,
    expectedSubjectAlternativeName: string,
    requestedNotAfter: Date,
    now: Date,
  ): ValidatedAgentCertificate {
    const certificate = new X509Certificate(issued.certificatePem);
    const issuer = new X509Certificate(issued.caCertificatePem);
    if (!issuer.ca || !certificate.checkIssued(issuer) || !certificate.verify(issuer.publicKey)) {
      throw new TypeError("Issued site-agent certificate does not chain to the configured CA");
    }
    const actualPublicKey = certificate.publicKey.export({ format: "der", type: "spki" });
    const expectedPublicKey = Buffer.from(expectedPublicKeySpkiDer);
    if (
      actualPublicKey.byteLength !== expectedPublicKey.byteLength ||
      !timingSafeEqual(actualPublicKey, expectedPublicKey)
    ) {
      throw new TypeError("Issued site-agent certificate does not bind the requested public key");
    }
    const expectedSan = `URI:${expectedSubjectAlternativeName}`;
    if (!certificate.subjectAltName?.split(", ").includes(expectedSan)) {
      throw new TypeError("Issued site-agent certificate does not bind the expected SAN URI");
    }
    if (!certificate.keyUsage?.includes("1.3.6.1.5.5.7.3.2")) {
      throw new TypeError("Issued site-agent certificate is missing clientAuth EKU");
    }
    const validFrom = new Date(certificate.validFrom);
    const notAfter = new Date(certificate.validTo);
    if (
      !Number.isFinite(validFrom.getTime()) ||
      !Number.isFinite(notAfter.getTime()) ||
      validFrom.getTime() > now.getTime() + 60_000 ||
      notAfter.getTime() <= now.getTime() + 60_000 ||
      notAfter.getTime() > requestedNotAfter.getTime() + 1_000
    ) {
      throw new TypeError("Issued site-agent certificate validity is outside the requested window");
    }
    const fingerprintSha256 = certificate.fingerprint256.replaceAll(":", "").toLowerCase();
    if (
      fingerprintSha256 !== issued.fingerprintSha256.toLowerCase() ||
      issued.subjectAlternativeName !== expectedSubjectAlternativeName ||
      Math.abs(issued.notAfter.getTime() - notAfter.getTime()) > 1_000
    ) {
      throw new TypeError("Certificate issuer metadata does not match the X.509 certificate");
    }
    return { fingerprintSha256, notAfter };
  }
}
