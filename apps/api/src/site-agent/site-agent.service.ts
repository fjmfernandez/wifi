import { createHash, createHmac, createPublicKey } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppEnvironment } from "../config/environment.js";
import {
  SITE_AGENT_CERTIFICATE_ISSUER,
  type SiteAgentCertificateIssuer,
} from "./certificate-issuer.js";
import { AgentCertificateValidator } from "./certificate-validator.js";
import { SiteAgentCommandSigner, canonicalAgentJson } from "./command-signer.js";
import {
  SITE_AGENT_PROTOCOL_VERSION,
  commandLeaseRequestSchema,
  enrollmentRequestSchema,
  enrollmentResponseSchema,
  eventAckSchema,
  siteAgentEventSchema,
  unsignedAgentCommandSchema,
  type CommandLeaseResponse,
  type EnrollmentResponse,
  type EventAck,
  type SiteAgentPrincipal,
  type UnsignedAgentCommand,
} from "./site-agent.contracts.js";
import { SITE_AGENT_REPOSITORY, type SiteAgentRepository } from "./site-agent.repository.js";

const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{32,512}$/;

function digestSha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function decodeCanonicalBase64(value: string): Buffer {
  const decoded = Buffer.from(value, "base64");
  if (decoded.byteLength === 0 || decoded.toString("base64") !== value) {
    throw new BadRequestException("La clave pública del agente no es válida");
  }
  return decoded;
}

@Injectable()
export class SiteAgentService {
  readonly #tokenHmacKey: Buffer | undefined;
  readonly #certificateTtlHours: number;
  readonly #maximumCommandsPerLease: number;
  readonly #commandLeaseSeconds: number;
  readonly #commandMaximumTtlSeconds: number;
  readonly #eventMaximumAgeDays: number;

  constructor(
    @Inject(SITE_AGENT_REPOSITORY)
    private readonly repository: SiteAgentRepository,
    @Inject(SITE_AGENT_CERTIFICATE_ISSUER)
    private readonly certificateIssuer: SiteAgentCertificateIssuer,
    private readonly certificateValidator: AgentCertificateValidator,
    private readonly commandSigner: SiteAgentCommandSigner,
    config: ConfigService<AppEnvironment, true>,
    private readonly now: () => Date = () => new Date(),
  ) {
    const tokenKey = config.get("SITE_AGENT_ENROLLMENT_TOKEN_HMAC_KEY_BASE64", {
      infer: true,
    });
    this.#tokenHmacKey = tokenKey ? Buffer.from(tokenKey, "base64url") : undefined;
    this.#certificateTtlHours = config.get("SITE_AGENT_CERTIFICATE_TTL_HOURS", {
      infer: true,
    });
    this.#maximumCommandsPerLease = config.get("SITE_AGENT_MAX_COMMANDS_PER_LEASE", {
      infer: true,
    });
    this.#commandLeaseSeconds = config.get("SITE_AGENT_COMMAND_LEASE_SECONDS", {
      infer: true,
    });
    this.#commandMaximumTtlSeconds = config.get("SITE_AGENT_COMMAND_MAX_TTL_SECONDS", {
      infer: true,
    });
    this.#eventMaximumAgeDays = config.get("SITE_AGENT_EVENT_MAX_AGE_DAYS", { infer: true });
  }

  async enroll(raw: unknown, authorization: string | undefined): Promise<EnrollmentResponse> {
    if (!this.certificateIssuer.ready) {
      throw new ServiceUnavailableException({
        message: "La PKI del agente de sede no está configurada",
        code: this.certificateIssuer.status,
      });
    }
    if (!this.#tokenHmacKey) {
      throw new ServiceUnavailableException({
        message: "El hashing de tokens de enrolamiento no está configurado",
        code: "SITE_AGENT_TOKEN_HASHING_NOT_CONFIGURED",
      });
    }
    const request = enrollmentRequestSchema.parse(raw);
    const token = this.#bearerToken(authorization);
    const tokenDigest = createHmac("sha256", this.#tokenHmacKey)
      .update("site-agent.enrollment-token.v1\0", "utf8")
      .update(token, "utf8")
      .digest();
    const now = this.now();
    const grant = await this.repository.resolveEnrollmentGrant(tokenDigest, now);
    if (!grant) throw new UnauthorizedException("Token de enrolamiento no válido");

    const publicKeySpkiDer = decodeCanonicalBase64(request.publicKeySpkiBase64);
    let publicKey: ReturnType<typeof createPublicKey>;
    try {
      publicKey = createPublicKey({ key: publicKeySpkiDer, format: "der", type: "spki" });
    } catch {
      throw new BadRequestException("La clave pública del agente no es válida");
    }
    if (
      publicKey.asymmetricKeyType !== "ec" ||
      publicKey.asymmetricKeyDetails?.namedCurve !== "prime256v1"
    ) {
      throw new BadRequestException("El agente debe usar una clave P-256");
    }

    const subjectAlternativeName = `urn:entelsat:wifi:agent:${grant.identityId}`;
    const requestedNotAfter = new Date(now.getTime() + this.#certificateTtlHours * 60 * 60_000);
    const issued = await this.certificateIssuer.issue({
      identityId: grant.identityId,
      tenantId: grant.tenantId,
      gatewayId: grant.gatewayId,
      publicKeySpkiDer,
      subjectAlternativeName,
      notBefore: new Date(now.getTime() - 60_000),
      notAfter: requestedNotAfter,
    });
    const validated = this.certificateValidator.validate(
      issued,
      publicKeySpkiDer,
      subjectAlternativeName,
      requestedNotAfter,
      now,
    );
    const activation = await this.repository.activateEnrollment({
      ...grant,
      tokenDigest,
      agentVersion: request.agentVersion,
      hostname: request.hostname,
      capabilities: request.capabilities,
      nonceDigest: createHash("sha256").update(request.nonce, "utf8").digest(),
      publicKeySha256: digestSha256(publicKeySpkiDer),
      certificatePem: issued.certificatePem,
      certificateFingerprintSha256: validated.fingerprintSha256,
      certificateSubjectAlternativeName: subjectAlternativeName,
      certificateNotAfter: validated.notAfter,
      enrolledAt: now,
    });
    if (activation.status !== "activated") {
      throw new UnauthorizedException("Token de enrolamiento no válido");
    }
    return enrollmentResponseSchema.parse({
      protocolVersion: SITE_AGENT_PROTOCOL_VERSION,
      identityId: grant.identityId,
      tenantId: grant.tenantId,
      gatewayId: grant.gatewayId,
      certificatePem: issued.certificatePem,
      caCertificatePem: issued.caCertificatePem,
      certificateNotAfter: validated.notAfter.toISOString(),
      initialCommandSequence: activation.initialCommandSequence,
    });
  }

  async leaseCommands(raw: unknown, principal: SiteAgentPrincipal): Promise<CommandLeaseResponse> {
    if (!this.commandSigner.ready) {
      throw new ServiceUnavailableException({
        message: "La firma de comandos del agente no está configurada",
        code: "SITE_AGENT_COMMAND_SIGNING_NOT_CONFIGURED",
      });
    }
    const request = commandLeaseRequestSchema.parse(raw);
    if (request.identityId !== principal.identityId) {
      throw new UnauthorizedException("Identidad de agente no válida");
    }
    const now = this.now();
    const lease = await this.repository.leaseCommands({
      principal,
      gatewayId: request.gatewayId,
      afterSequence: request.afterSequence,
      maximumCommands: Math.min(request.maximumCommands, this.#maximumCommandsPerLease),
      leasedUntil: new Date(now.getTime() + this.#commandLeaseSeconds * 1_000),
      now,
    });
    if (lease.status === "identity_invalid") {
      throw new UnauthorizedException("Identidad de agente no válida");
    }
    if (lease.status === "sequence_mismatch") {
      throw new ConflictException({
        message: "La secuencia del agente no coincide con el plano de control",
        code: "SITE_AGENT_SEQUENCE_MISMATCH",
      });
    }

    const commands: UnsignedAgentCommand[] = [];
    let expectedSequence = request.afterSequence + 1;
    for (const rawCommand of lease.commands) {
      const command = unsignedAgentCommandSchema.parse(rawCommand);
      const issuedAt = Date.parse(command.issuedAt);
      const expiresAt = Date.parse(command.expiresAt);
      if (
        command.type === "provisioning.apply" ||
        command.gatewayId !== request.gatewayId ||
        command.sequence !== expectedSequence ||
        issuedAt > now.getTime() + 30_000 ||
        expiresAt <= now.getTime() ||
        expiresAt <= issuedAt ||
        expiresAt - issuedAt > this.#commandMaximumTtlSeconds * 1_000
      ) {
        throw new ServiceUnavailableException({
          message: "El contrato durable de comandos no es seguro",
          code:
            command.type === "provisioning.apply"
              ? "BLOCKED_BY_LAB_VALIDATION"
              : "SITE_AGENT_COMMAND_CONTRACT_INVALID",
        });
      }
      commands.push(command);
      expectedSequence += 1;
    }
    return {
      protocolVersion: SITE_AGENT_PROTOCOL_VERSION,
      commands: commands.map((command) => this.commandSigner.sign(command)),
    };
  }

  async recordEvent(
    raw: unknown,
    idempotencyKey: string | undefined,
    principal: SiteAgentPrincipal,
  ): Promise<EventAck> {
    const event = siteAgentEventSchema.parse(raw);
    if (idempotencyKey !== event.id) {
      throw new ConflictException({
        message: "Idempotency-Key debe coincidir con el identificador del evento",
        code: "SITE_AGENT_IDEMPOTENCY_KEY_MISMATCH",
      });
    }
    if (event.identityId !== principal.identityId) {
      throw new UnauthorizedException("Identidad de agente no válida");
    }
    const now = this.now();
    const occurredAt = Date.parse(event.occurredAt);
    if (
      occurredAt > now.getTime() + 5 * 60_000 ||
      occurredAt < now.getTime() - this.#eventMaximumAgeDays * 24 * 60 * 60_000
    ) {
      throw new BadRequestException("La fecha del evento está fuera de la ventana admitida");
    }
    const result = await this.repository.recordEvent({
      principal,
      event,
      eventDigest: digestSha256(canonicalAgentJson(event)),
      receivedAt: now,
    });
    if (result.status === "identity_invalid") {
      throw new UnauthorizedException("Identidad de agente no válida");
    }
    if (result.status === "conflict") {
      throw new ConflictException({
        message: "El identificador de evento ya existe con otro contenido",
        code: "SITE_AGENT_EVENT_CONFLICT",
      });
    }
    return eventAckSchema.parse({ status: result.status, eventId: event.id });
  }

  #bearerToken(authorization: string | undefined): string {
    const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization ?? "");
    if (!match?.[1] || !TOKEN_PATTERN.test(match[1])) {
      throw new UnauthorizedException("Token de enrolamiento no válido");
    }
    return match[1];
  }
}
