import { createHash, randomUUID } from "node:crypto";

import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CaptiveAuthorizationResult,
  CaptiveAuthorize,
  CaptiveLegalDocument,
  LoginMethod,
} from "@wifi/contracts";
import { compileSupportedReplyAttributes } from "@wifi/radius";
import {
  constantTimeEqual,
  deriveScopedKey,
  keyedDigest,
  sealSecret,
  voucherLookupDigest,
} from "@wifi/security";
import type { TenantTransaction } from "@wifi-entelsat/database";

import { currentRequestContext } from "../common/request-context.js";
import type { AppEnvironment } from "../config/environment.js";
import { DatabaseService } from "../infrastructure/database.service.js";
import type {
  CaptiveGatewayContext,
  CaptiveRepository,
  PendingCaptiveAttempt,
} from "./captive.repository.js";

const supportedMethods = new Set<LoginMethod>(["click", "email", "pin", "voucher"]);

function isLoginMethod(value: string): value is LoginMethod {
  return supportedMethods.has(value as LoginMethod);
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : fallback;
}

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function dbBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value);
}

@Injectable()
export class PrismaCaptiveRepository implements CaptiveRepository {
  private readonly dataMasterKey: Buffer;
  private readonly voucherMasterKey: Buffer;
  private readonly radiusMode: AppEnvironment["RADIUS_CREDENTIAL_MODE"];

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.dataMasterKey = Buffer.from(
      config.getOrThrow<string>("DATA_ENCRYPTION_MASTER_KEY_BASE64"),
      "base64url",
    );
    this.voucherMasterKey = Buffer.from(
      config.getOrThrow<string>("VOUCHER_HMAC_MASTER_KEY_BASE64"),
      "base64url",
    );
    this.radiusMode = config.get("RADIUS_CREDENTIAL_MODE", { infer: true });
  }

  async resolveGateway(locatorDigest: Buffer): Promise<CaptiveGatewayContext | undefined> {
    const route = await this.database.resolveCaptiveLocator(locatorDigest);
    if (!route) return undefined;
    return this.database.withTenant(route.tenantId, (transaction) =>
      this.loadGatewayContext(transaction, route),
    );
  }

  async markGatewaySeen(
    locatorDigest: Buffer,
  ): Promise<{ gatewayId: string; nasIdentifier: string } | undefined> {
    const route = await this.database.resolveCaptiveLocator(locatorDigest);
    if (!route) return undefined;
    return this.database.withTenant(route.tenantId, async (transaction) => {
      const gateway = await transaction.gateway.update({
        where: { tenantId_id: { tenantId: route.tenantId, id: route.gatewayId } },
        data: { lastSeenAt: new Date(), status: "online" },
        select: { id: true, nasIdentifier: true },
      });
      return { gatewayId: gateway.id, nasIdentifier: gateway.nasIdentifier };
    });
  }

  async createAttempt(attempt: PendingCaptiveAttempt): Promise<void> {
    if (!attempt.normalizedMac) throw new Error("CAPTIVE_MAC_MISSING");
    const normalizedMac = attempt.normalizedMac;
    await this.database.withTenant(attempt.gateway.tenantId, async (transaction) => {
      const identitySpace = await transaction.identitySpace.findFirst({
        where: { tenantId: attempt.gateway.tenantId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!identitySpace) throw new Error("CAPTIVE_IDENTITY_SPACE_MISSING");

      const encryptionKey = deriveScopedKey(
        this.dataMasterKey,
        attempt.gateway.tenantId,
        "identity-data",
      );
      const existingDevice = await transaction.clientDevice.findFirst({
        where: {
          tenantId: attempt.gateway.tenantId,
          identitySpaceId: identitySpace.id,
          macHmac: dbBytes(attempt.macDigest),
          archivedAt: null,
        },
        select: { id: true },
      });
      const device = existingDevice
        ? await transaction.clientDevice.update({
            where: { id: existingDevice.id },
            data: { lastSeenAt: new Date() },
            select: { id: true },
          })
        : await transaction.clientDevice.create({
            data: {
              tenantId: attempt.gateway.tenantId,
              identitySpaceId: identitySpace.id,
              macCiphertext: dbBytes(sealSecret(normalizedMac, encryptionKey, "device.mac.v1")),
              macHmac: dbBytes(attempt.macDigest),
              keyVersion: "env-v1",
              privateMac: (Number.parseInt(normalizedMac.slice(0, 2), 16) & 2) === 2,
            },
            select: { id: true },
          });

      await transaction.captiveAttempt.create({
        data: {
          tenantId: attempt.gateway.tenantId,
          gatewayId: attempt.gateway.gatewayId,
          deviceId: device.id,
          stateHash: dbBytes(attempt.stateDigest),
          nonceHash: dbBytes(attempt.nonceDigest),
          claimedMacHmac: dbBytes(attempt.macDigest),
          claimedIpHmac: dbBytes(attempt.ipDigest),
          returnIntent: {
            linkLogin: attempt.linkLogin,
            ...(attempt.linkOrig ? { linkOrig: attempt.linkOrig } : {}),
          },
          expiresAt: attempt.expiresAt,
        },
      });
    });
  }

  async getAttempt(stateDigest: Buffer): Promise<PendingCaptiveAttempt | undefined> {
    const route = await this.database.resolveCaptiveAttempt(stateDigest);
    if (!route) return undefined;
    return this.database.withTenant(route.tenantId, async (transaction) => {
      const row = await transaction.captiveAttempt.findUnique({
        where: { id: route.attemptId },
        select: {
          stateHash: true,
          nonceHash: true,
          claimedMacHmac: true,
          claimedIpHmac: true,
          returnIntent: true,
          expiresAt: true,
          gatewayId: true,
        },
      });
      if (!row?.claimedMacHmac || !row.claimedIpHmac) return undefined;
      const gateway = await this.loadGatewayContext(transaction, {
        tenantId: route.tenantId,
        gatewayId: row.gatewayId,
      });
      if (!gateway) return undefined;
      const intent = asObject(row.returnIntent);
      const linkLogin = readString(intent["linkLogin"]);
      if (!linkLogin) return undefined;
      const linkOrig = readString(intent["linkOrig"]);
      return {
        stateDigest: Buffer.from(row.stateHash),
        nonceDigest: Buffer.from(row.nonceHash),
        gateway,
        macDigest: Buffer.from(row.claimedMacHmac),
        ipDigest: Buffer.from(row.claimedIpHmac),
        linkLogin,
        ...(linkOrig ? { linkOrig } : {}),
        expiresAt: row.expiresAt,
      };
    });
  }

  async getLegalDocument(
    tenantId: string,
    siteName: string,
    legalVersionId: string,
    locale: "es" | "en",
  ): Promise<CaptiveLegalDocument | undefined> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const legal = await transaction.legalVersion.findFirst({
        where: {
          id: legalVersionId,
          tenantId,
          locale,
          status: "published",
          publishedAt: { lte: new Date() },
          document: { kind: "terms" },
        },
        include: { document: { select: { name: true, kind: true } } },
      });
      if (!legal?.publishedAt) return undefined;
      return {
        id: legal.id,
        siteName,
        title: legal.document.name,
        kind: legal.document.kind,
        version: legal.version,
        locale,
        content: legal.content,
        contentHash: legal.contentHash,
        publishedAt: legal.publishedAt.toISOString(),
      };
    });
  }

  async issueAuthorization(
    stateDigest: Buffer,
    request: CaptiveAuthorize,
    credential: { username: string; password: string; expiresAt: Date },
  ): Promise<CaptiveAuthorizationResult> {
    if (this.radiusMode !== "cleartext-lab-validated") {
      throw new ServiceUnavailableException({
        message:
          "La emisión RADIUS está bloqueada hasta validar el verificador en laboratorio físico",
        code: "BLOCKED_BY_LAB_VALIDATION_RADIUS_VERIFIER",
      });
    }
    const route = await this.database.resolveCaptiveAttempt(stateDigest);
    if (!route) throw new Error("CAPTIVE_STATE_INVALID");

    return this.database.withTenant(route.tenantId, async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id
          FROM app.captive_attempts
         WHERE tenant_id = ${route.tenantId}::uuid
           AND id = ${route.attemptId}::uuid
           AND state_hash = ${stateDigest}
           AND status = 'pending'
           AND consumed_at IS NULL
           AND expires_at > CURRENT_TIMESTAMP
         FOR UPDATE
      `;
      if (!locked[0]) throw new Error("CAPTIVE_STATE_INVALID");

      const attempt = await transaction.captiveAttempt.findUnique({
        where: { id: route.attemptId },
        include: { gateway: true },
      });
      if (!attempt) throw new Error("CAPTIVE_STATE_INVALID");

      const method = await transaction.loginMethod.findFirst({
        where: {
          tenantId: route.tenantId,
          siteId: attempt.gateway.siteId,
          kind: request.method,
          enabled: true,
          OR: [{ availableFrom: null }, { availableFrom: { lte: new Date() } }],
          AND: [{ OR: [{ availableUntil: null }, { availableUntil: { gt: new Date() } }] }],
        },
        include: { policyVersion: { include: { policy: true } } },
      });
      if (!method || method.policyVersion.status !== "published") {
        throw new Error("CAPTIVE_CREDENTIAL_INVALID");
      }
      const legal = await transaction.legalVersion.findFirst({
        where: {
          id: request.acceptedLegalVersionId,
          tenantId: route.tenantId,
          status: "published",
          document: { kind: "terms" },
        },
        select: { id: true },
      });
      if (!legal) throw new Error("CAPTIVE_LEGAL_VERSION_INVALID");

      const voucher =
        request.method === "voucher"
          ? await this.lockVoucher(
              transaction,
              route.tenantId,
              attempt.gateway.siteId,
              request.voucher ?? "",
            )
          : undefined;
      if (request.method === "voucher" && !voucher) {
        throw new Error("CAPTIVE_CREDENTIAL_INVALID");
      }
      if (request.method === "pin") {
        this.assertPin(method.config, request.pin ?? "", route.tenantId);
      }

      const endUserId = request.email
        ? await this.resolveEmailIdentity(transaction, route.tenantId, request.email, {
            firstName: request.firstName,
            lastName: request.lastName,
          })
        : undefined;
      if (endUserId && attempt.deviceId) {
        const activeLink = await transaction.endUserDeviceLink.findFirst({
          where: {
            tenantId: route.tenantId,
            endUserId,
            deviceId: attempt.deviceId,
            endsAt: null,
          },
          select: { id: true },
        });
        if (!activeLink) {
          await transaction.endUserDeviceLink.create({
            data: {
              tenantId: route.tenantId,
              endUserId,
              deviceId: attempt.deviceId,
              source: request.method,
            },
          });
        }
      }

      const now = new Date();
      const policy = method.policyVersion;
      const snapshot = asObject(policy.snapshot);
      const authorizationExpiresAt = new Date(
        now.getTime() +
          1_000 * (policy.totalDurationSeconds ?? policy.sessionTimeoutSeconds ?? 8 * 60 * 60),
      );
      const authorizationId = randomUUID();
      const replyAttributes = compileSupportedReplyAttributes({
        opaqueClass: `wifi:${authorizationId}`,
        interimIntervalSeconds: readInt(snapshot["interimIntervalSeconds"], 300),
        portLimit: policy.maxConcurrentDevices,
        ...(policy.uploadKbps && policy.downloadKbps
          ? { nasRxKbps: policy.uploadKbps, nasTxKbps: policy.downloadKbps }
          : {}),
        ...(policy.sessionTimeoutSeconds
          ? { sessionTimeoutSeconds: policy.sessionTimeoutSeconds }
          : {}),
        ...(policy.idleTimeoutSeconds ? { idleTimeoutSeconds: policy.idleTimeoutSeconds } : {}),
      });
      const jsonReplyAttributes = replyAttributes.map((attribute) => ({ ...attribute }));
      const evidence = {
        attemptId: attempt.id,
        gatewayId: attempt.gatewayId,
        siteId: attempt.gateway.siteId,
        method: request.method,
        legalVersionId: legal.id,
        policyVersionId: policy.id,
        replyAttributes: jsonReplyAttributes,
      };

      await transaction.accessAuthorization.create({
        data: {
          id: authorizationId,
          tenantId: route.tenantId,
          attemptId: attempt.id,
          gatewayId: attempt.gatewayId,
          policyVersionId: policy.id,
          ...(endUserId ? { endUserId } : {}),
          ...(attempt.deviceId ? { deviceId: attempt.deviceId } : {}),
          method: request.method,
          effectiveAttributes: evidence,
          startsAt: now,
          expiresAt: authorizationExpiresAt,
          evidenceHash: sha256Json(evidence),
        },
      });
      const runtimeCredential = await transaction.radiusRuntimeCredential.create({
        data: {
          tenantId: route.tenantId,
          authorizationId,
          gatewayId: attempt.gatewayId,
          username: credential.username,
          nasIdentifier: attempt.gateway.nasIdentifier,
          verifierAttribute: "Cleartext-Password",
          verifierValue: credential.password,
          expiresAt: credential.expiresAt,
          maxUses: 1,
        },
        select: { id: true },
      });
      await transaction.radiusReplyAttribute.createMany({
        data: replyAttributes.map((attribute, priority) => ({
          tenantId: route.tenantId,
          credentialId: runtimeCredential.id,
          attribute: attribute.attribute,
          operator: attribute.op,
          value: attribute.value,
          priority,
        })),
      });
      await transaction.legalAcceptance.create({
        data: {
          tenantId: route.tenantId,
          ...(endUserId ? { endUserId } : {}),
          authorizationId,
          legalVersionId: legal.id,
          locale: request.locale,
          evidence: { stateHash: stateDigest.toString("base64url"), explicit: true },
        },
      });

      if (endUserId && request.marketingConsent !== undefined) {
        const purpose = await transaction.processingPurpose.findFirst({
          where: { tenantId: route.tenantId, code: "marketing" },
          select: { id: true },
        });
        if (purpose) {
          await transaction.consentEvent.create({
            data: {
              tenantId: route.tenantId,
              endUserId,
              purposeId: purpose.id,
              legalVersionId: legal.id,
              decision: request.marketingConsent ? "granted" : "rejected",
              evidence: { authorizationId, source: "captive_portal" },
            },
          });
        }
      }
      if (voucher) {
        const nextUsedCount = voucher.used_count + 1;
        await transaction.voucher.update({
          where: { id: voucher.id },
          data: {
            usedCount: nextUsedCount,
            ...(nextUsedCount >= voucher.max_uses ? { state: "consumed" } : {}),
          },
        });
        await transaction.voucherRedemption.create({
          data: {
            tenantId: route.tenantId,
            voucherId: voucher.id,
            attemptId: attempt.id,
            authorizationId,
            outcome: "accepted",
          },
        });
      }

      await transaction.captiveAttempt.update({
        where: { id: attempt.id },
        data: { status: "authorized", consumedAt: now },
      });
      await transaction.outboxEvent.create({
        data: {
          tenantId: route.tenantId,
          aggregateType: "access_authorization",
          aggregateId: authorizationId,
          eventType: "access.authorization.issued",
          payload: { authorizationId, gatewayId: attempt.gatewayId },
        },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: route.tenantId,
          actorType: "end_user",
          ...(endUserId ? { actorId: endUserId } : {}),
          action: "captive.authorization.issue",
          resourceType: "access_authorization",
          resourceId: authorizationId,
          scope: { siteId: attempt.gateway.siteId, method: request.method },
          afterRedacted: { status: "issued", expiresAt: authorizationExpiresAt.toISOString() },
          correlationId: currentRequestContext()?.correlationId ?? randomUUID(),
        },
      });

      return {
        authorizationId,
        username: credential.username,
        password: credential.password,
        loginUrl: readString(asObject(attempt.returnIntent)["linkLogin"]) ?? "",
        expiresAt: credential.expiresAt.toISOString(),
      };
    });
  }

  private async loadGatewayContext(
    transaction: TenantTransaction,
    route: {
      tenantId: string;
      gatewayId: string;
      siteId?: string;
      allowedLoginOrigins?: string[];
    },
  ): Promise<CaptiveGatewayContext | undefined> {
    const gateway = await transaction.gateway.findFirst({
      where: { id: route.gatewayId, tenantId: route.tenantId, retiredAt: null },
      include: { site: true },
    });
    if (!gateway || (route.siteId && gateway.siteId !== route.siteId)) return undefined;
    const now = new Date();
    const methods = await transaction.loginMethod.findMany({
      where: {
        tenantId: route.tenantId,
        siteId: gateway.siteId,
        enabled: true,
        OR: [{ availableFrom: null }, { availableFrom: { lte: now } }],
        AND: [{ OR: [{ availableUntil: null }, { availableUntil: { gt: now } }] }],
        policyVersion: { status: "published" },
      },
      orderBy: { displayOrder: "asc" },
      select: { kind: true },
    });
    const legalCandidates = await transaction.legalVersion.findMany({
      where: {
        tenantId: route.tenantId,
        status: "published",
        locale: { in: ["es", "en"] },
        publishedAt: { lte: now },
        document: { kind: "terms" },
      },
      orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
      select: { id: true, locale: true },
    });
    const seenLocales = new Set<string>();
    const legalVersions = legalCandidates
      .filter(
        (candidate): candidate is { id: string; locale: "es" | "en" } =>
          candidate.locale === "es" || candidate.locale === "en",
      )
      .filter((candidate) => {
        if (seenLocales.has(candidate.locale)) return false;
        seenLocales.add(candidate.locale);
        return true;
      });
    const legal = legalVersions.find((version) => version.locale === "es") ?? legalVersions[0];
    const availableMethods = methods.map((method) => method.kind).filter(isLoginMethod);
    if (!legal || availableMethods.length === 0) return undefined;
    const publication = await transaction.portalPublication.findFirst({
      where: {
        tenantId: route.tenantId,
        siteId: gateway.siteId,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        portalVersion: { status: "published" },
      },
      orderBy: { startsAt: "desc" },
      include: {
        portalVersion: {
          include: {
            portal: { select: { name: true } },
            blocks: { orderBy: { displayOrder: "asc" } },
          },
        },
      },
    });
    const fallbackPortal = publication
      ? undefined
      : await transaction.portal.findFirst({
          where: { tenantId: route.tenantId, archivedAt: null },
          orderBy: { createdAt: "desc" },
          include: {
            versions: {
              orderBy: { version: "desc" },
              take: 1,
              include: { blocks: { orderBy: { displayOrder: "asc" } } },
            },
          },
        });
    const portalVersion = publication?.portalVersion ?? fallbackPortal?.versions[0];
    const heroBlock = portalVersion?.blocks.find((block) => block.kind === "hero");
    const heroProps = asObject(heroBlock?.props);
    const theme = asObject(portalVersion?.theme);
    const logoUrl = readNonEmptyString(theme["logoUrl"]);
    const primaryColor = readNonEmptyString(theme["primaryColor"]);
    return {
      tenantId: route.tenantId,
      gatewayId: gateway.id,
      siteId: gateway.siteId,
      siteName: gateway.site.name,
      nasIdentifier: gateway.nasIdentifier,
      legalVersionId: legal.id,
      legalVersions,
      allowedLoginOrigins: route.allowedLoginOrigins ?? [],
      availableMethods,
      ...(portalVersion
        ? {
            portal: {
              name:
                publication?.portalVersion.portal.name ?? fallbackPortal?.name ?? gateway.site.name,
              headline:
                readNonEmptyString(heroProps["headline"]) ?? `Bienvenido a ${gateway.site.name}`,
              body:
                readNonEmptyString(heroProps["body"]) ??
                "Introduce tus datos para acceder al WiFi.",
              ...(logoUrl ? { logoUrl } : {}),
              ...(primaryColor ? { primaryColor } : {}),
            },
          }
        : {}),
    };
  }

  private async lockVoucher(
    transaction: TenantTransaction,
    tenantId: string,
    siteId: string,
    code: string,
  ): Promise<{ id: string; used_count: number; max_uses: number } | undefined> {
    const tenantKey = deriveScopedKey(this.voucherMasterKey, tenantId, "vouchers");
    const codeHmac = voucherLookupDigest(code, tenantKey);
    const rows = await transaction.$queryRaw<
      Array<{ id: string; used_count: number; max_uses: number }>
    >`
      SELECT voucher.id, voucher.used_count, voucher.max_uses
        FROM app.vouchers AS voucher
        JOIN app.voucher_batches AS batch
          ON batch.tenant_id = voucher.tenant_id AND batch.id = voucher.batch_id
       WHERE voucher.tenant_id = ${tenantId}::uuid
         AND batch.site_id = ${siteId}::uuid
         AND voucher.code_hmac = ${codeHmac}
         AND voucher.state = 'available'
         AND voucher.revoked_at IS NULL
         AND voucher.expires_at > CURRENT_TIMESTAMP
         AND voucher.used_count < voucher.max_uses
       FOR UPDATE OF voucher
    `;
    return rows[0];
  }

  private assertPin(configValue: unknown, suppliedPin: string, tenantId: string): void {
    const configured = readString(asObject(configValue)["pinHmac"]);
    if (!configured) throw new Error("CAPTIVE_CREDENTIAL_INVALID");
    const tenantKey = deriveScopedKey(this.voucherMasterKey, tenantId, "site-pins");
    const supplied = keyedDigest(suppliedPin, tenantKey, "captive.pin.v1");
    const expected = Buffer.from(configured, "base64url");
    if (expected.byteLength !== 32 || !constantTimeEqual(supplied, expected)) {
      throw new Error("CAPTIVE_CREDENTIAL_INVALID");
    }
  }

  private async resolveEmailIdentity(
    transaction: TenantTransaction,
    tenantId: string,
    email: string,
    profile?: { firstName?: string | undefined; lastName?: string | undefined },
  ): Promise<string> {
    const identitySpace = await transaction.identitySpace.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!identitySpace) throw new Error("CAPTIVE_IDENTITY_SPACE_MISSING");
    const tenantKey = deriveScopedKey(this.dataMasterKey, tenantId, "identity-data");
    const valueHmac = keyedDigest(email, tenantKey, "identity.email.v1");
    const existing = await transaction.endUserIdentifier.findFirst({
      where: {
        tenantId,
        identitySpaceId: identitySpace.id,
        kind: "email",
        valueHmac: dbBytes(valueHmac),
      },
      select: { endUserId: true },
    });
    if (existing) {
      await transaction.endUser.update({
        where: { id: existing.endUserId },
        data: {
          retentionAnchor: new Date(),
          ...(profile?.firstName && profile.lastName
            ? {
                profileCiphertext: dbBytes(
                  sealSecret(
                    JSON.stringify({
                      firstName: profile.firstName,
                      lastName: profile.lastName,
                      updatedAt: new Date().toISOString(),
                    }),
                    tenantKey,
                    "identity.profile.v1",
                  ),
                ),
                profileKeyVersion: "env-v1",
              }
            : {}),
        },
      });
      return existing.endUserId;
    }
    const endUser = await transaction.endUser.create({
      data: {
        tenantId,
        identitySpaceId: identitySpace.id,
        ...(profile?.firstName && profile.lastName
          ? {
              profileCiphertext: dbBytes(
                sealSecret(
                  JSON.stringify({
                    firstName: profile.firstName,
                    lastName: profile.lastName,
                    updatedAt: new Date().toISOString(),
                  }),
                  tenantKey,
                  "identity.profile.v1",
                ),
              ),
              profileKeyVersion: "env-v1",
            }
          : {}),
      },
      select: { id: true },
    });
    await transaction.endUserIdentifier.create({
      data: {
        tenantId,
        identitySpaceId: identitySpace.id,
        endUserId: endUser.id,
        kind: "email",
        ciphertext: dbBytes(sealSecret(email, tenantKey, "identity.email.v1")),
        valueHmac: dbBytes(valueHmac),
        keyVersion: "env-v1",
      },
    });
    return endUser.id;
  }
}
