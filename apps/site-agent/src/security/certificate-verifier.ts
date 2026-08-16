import { createPrivateKey, X509Certificate } from "node:crypto";

export interface CertificateVerifier {
  verify(
    certificatePem: string,
    caCertificatePem: string,
    privateKeyPem: string,
    declaredNotAfter: string,
    expectedIdentityId: string,
    now: Date,
  ): void;
}

export class NodeCertificateVerifier implements CertificateVerifier {
  verify(
    certificatePem: string,
    caCertificatePem: string,
    privateKeyPem: string,
    declaredNotAfter: string,
    expectedIdentityId: string,
    now: Date,
  ): void {
    const certificate = new X509Certificate(certificatePem);
    const issuer = new X509Certificate(caCertificatePem);
    const privateKey = createPrivateKey(privateKeyPem);
    if (!certificate.checkPrivateKey(privateKey)) {
      throw new TypeError("Enrolled certificate does not match the locally generated private key");
    }
    if (!certificate.checkIssued(issuer) || !certificate.verify(issuer.publicKey)) {
      throw new TypeError("Enrolled certificate is not signed by the returned CA");
    }
    if (!issuer.ca) {
      throw new TypeError("Enrolled certificate issuer is not a CA certificate");
    }
    const expectedSan = `URI:urn:entelsat:wifi:agent:${expectedIdentityId}`;
    if (!certificate.subjectAltName?.split(", ").includes(expectedSan)) {
      throw new TypeError("Enrolled certificate is not bound to the expected agent identity");
    }
    const clientAuthenticationOid = "1.3.6.1.5.5.7.3.2";
    if (!certificate.keyUsage?.includes(clientAuthenticationOid)) {
      throw new TypeError("Enrolled certificate is not valid for TLS client authentication");
    }
    const actualStart = Date.parse(certificate.validFrom);
    const actualExpiry = Date.parse(certificate.validTo);
    const declaredExpiry = Date.parse(declaredNotAfter);
    if (!Number.isFinite(actualExpiry) || Math.abs(actualExpiry - declaredExpiry) > 1_000) {
      throw new TypeError("Enrolled certificate expiry does not match its signed contents");
    }
    if (actualExpiry <= now.getTime() + 60_000) {
      throw new TypeError("Enrolled certificate is already expired or too close to expiry");
    }
    if (!Number.isFinite(actualStart) || actualStart > now.getTime() + 60_000) {
      throw new TypeError("Enrolled certificate is not yet valid");
    }
  }
}
