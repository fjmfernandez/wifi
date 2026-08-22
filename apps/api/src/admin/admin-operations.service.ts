import { randomBytes } from "node:crypto";

import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { generateOpaqueToken, keyedDigest } from "@wifi/security";

import type { AppEnvironment } from "../config/environment.js";
import { DatabaseService } from "../infrastructure/database.service.js";

export interface CreateSiteInput {
  code: string;
  name: string;
  countryCode: string;
  timezone: string;
  organizationId?: string | undefined;
}

export interface CreateGatewayInput {
  siteId: string;
  name: string;
  nasIdentifier: string;
  model?: string | undefined;
  serial?: string | undefined;
}

export interface CreateOrganizationInput {
  code: string;
  name: string;
  legalName?: string | undefined;
}

export interface CreatePolicyInput {
  name: string;
  downloadKbps?: number | undefined;
  uploadKbps?: number | undefined;
  sessionTimeoutHours?: number | undefined;
  quotaGb?: number | undefined;
  maxConcurrentDevices?: number | undefined;
}

export interface CreatePortalInput {
  name: string;
  headline?: string | undefined;
  body?: string | undefined;
}

export interface CreateVoucherBatchInput {
  siteId: string;
  policyVersionId: string;
  name: string;
  quantity: number;
  expiresAt: string;
  defaultMaxUses?: number | undefined;
  defaultMaxDevices?: number | undefined;
}

export interface UpdateOrganizationInput {
  code?: string | undefined;
  name?: string | undefined;
  legalName?: string | undefined;
}

export interface UpdateSiteInput {
  organizationId?: string | undefined;
  code?: string | undefined;
  name?: string | undefined;
  countryCode?: string | undefined;
  timezone?: string | undefined;
}

export interface UpdateGatewayInput {
  siteId?: string | undefined;
  name?: string | undefined;
  nasIdentifier?: string | undefined;
  model?: string | undefined;
  serial?: string | undefined;
  status?: string | undefined;
}

export interface UpdatePolicyInput {
  name?: string | undefined;
  downloadKbps?: number | undefined;
  uploadKbps?: number | undefined;
  sessionTimeoutHours?: number | undefined;
  quotaGb?: number | undefined;
  maxConcurrentDevices?: number | undefined;
}

export interface UpdatePortalInput {
  name?: string | undefined;
  headline?: string | undefined;
  body?: string | undefined;
}

export interface CreateGatewayLinkInput {
  tunnelClientIp: string;
  hotspotDnsName: string;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

@Injectable()
export class AdminOperationsService {
  private readonly voucherKey: Buffer;
  private readonly captiveIdentifierKey: Buffer;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.voucherKey = Buffer.from(
      config.getOrThrow<string>("VOUCHER_HMAC_MASTER_KEY_BASE64"),
      "base64url",
    );
    this.captiveIdentifierKey = Buffer.from(
      config.getOrThrow<string>("CAPTIVE_IDENTIFIER_HMAC_KEY_BASE64"),
      "base64url",
    );
  }

  async listOrganizations(tenantId: string): Promise<unknown[]> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const organizations = await transaction.organization.findMany({
        where: { tenantId, archivedAt: null },
        orderBy: { createdAt: "desc" },
        include: { sites: { where: { archivedAt: null }, select: { id: true } } },
      });
      return organizations.map((organization) => ({
        id: organization.id,
        code: organization.code,
        name: organization.name,
        legalName: organization.legalName,
        status: organization.status,
        sitesTotal: organization.sites.length,
        createdAt: organization.createdAt.toISOString(),
      }));
    });
  }

  async createOrganization(tenantId: string, input: CreateOrganizationInput): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const organization = await transaction.organization.create({
        data: {
          tenantId,
          code: input.code,
          name: input.name,
          ...(input.legalName ? { legalName: input.legalName } : {}),
          status: "active",
        },
      });
      return {
        id: organization.id,
        code: organization.code,
        name: organization.name,
        legalName: organization.legalName,
        status: organization.status,
        sitesTotal: 0,
        createdAt: organization.createdAt.toISOString(),
      };
    });
  }

  async updateOrganization(
    tenantId: string,
    organizationId: string,
    input: UpdateOrganizationInput,
  ): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const current = await transaction.organization.findFirst({
        where: { tenantId, id: organizationId, archivedAt: null },
      });
      if (!current) throw new NotFoundException("Organización no encontrada");
      const organization = await transaction.organization.update({
        where: { tenantId_id: { tenantId, id: organizationId } },
        data: {
          ...(input.code === undefined ? {} : { code: input.code }),
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.legalName === undefined ? {} : { legalName: input.legalName || null }),
        },
        include: { sites: { where: { archivedAt: null }, select: { id: true } } },
      });
      return {
        id: organization.id,
        code: organization.code,
        name: organization.name,
        legalName: organization.legalName,
        status: organization.status,
        sitesTotal: organization.sites.length,
        createdAt: organization.createdAt.toISOString(),
      };
    });
  }

  async archiveOrganization(tenantId: string, organizationId: string): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const organization = await transaction.organization.update({
        where: { tenantId_id: { tenantId, id: organizationId } },
        data: { archivedAt: new Date(), status: "archived" },
      });
      return { id: organization.id, archived: true };
    });
  }

  async listSites(tenantId: string): Promise<unknown[]> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const sites = await transaction.site.findMany({
        where: { tenantId, archivedAt: null },
        orderBy: { createdAt: "desc" },
        include: { gateways: { where: { retiredAt: null }, select: { id: true, status: true } } },
      });
      return sites.map((site) => ({
        id: site.id,
        code: site.code,
        name: site.name,
        status: site.status,
        timezone: site.timezone,
        countryCode: site.countryCode,
        gatewaysTotal: site.gateways.length,
        gatewaysOnline: site.gateways.filter((gateway) => gateway.status === "online").length,
        createdAt: site.createdAt.toISOString(),
      }));
    });
  }

  async createSite(tenantId: string, input: CreateSiteInput): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const organization =
        (input.organizationId
          ? await transaction.organization.findFirst({
              where: { tenantId, id: input.organizationId, archivedAt: null },
            })
          : await transaction.organization.findFirst({
              where: { tenantId, archivedAt: null },
              orderBy: { createdAt: "asc" },
            })) ??
        (await transaction.organization.create({
          data: {
            tenantId,
            code: "ENTELSAT",
            name: "ENTELSAT",
            legalName: "ENTELSAT",
            status: "active",
          },
        }));

      const site = await transaction.site.create({
        data: {
          tenantId,
          organizationId: organization.id,
          code: input.code,
          name: input.name,
          status: "active",
          timezone: input.timezone,
          countryCode: input.countryCode,
          languages: ["es"],
          branding: {},
        },
      });
      return {
        id: site.id,
        code: site.code,
        name: site.name,
        status: site.status,
        timezone: site.timezone,
        countryCode: site.countryCode,
        gatewaysTotal: 0,
        gatewaysOnline: 0,
        createdAt: site.createdAt.toISOString(),
      };
    });
  }

  async updateSite(tenantId: string, siteId: string, input: UpdateSiteInput): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const current = await transaction.site.findFirst({
        where: { tenantId, id: siteId, archivedAt: null },
      });
      if (!current) throw new NotFoundException("Sede no encontrada");
      if (input.organizationId) {
        const organization = await transaction.organization.findFirst({
          where: { tenantId, id: input.organizationId, archivedAt: null },
        });
        if (!organization) throw new NotFoundException("Organización no encontrada");
      }
      const site = await transaction.site.update({
        where: { tenantId_id: { tenantId, id: siteId } },
        data: {
          ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
          ...(input.code === undefined ? {} : { code: input.code }),
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.countryCode === undefined ? {} : { countryCode: input.countryCode }),
          ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
        },
        include: { gateways: { where: { retiredAt: null }, select: { id: true, status: true } } },
      });
      return {
        id: site.id,
        code: site.code,
        name: site.name,
        status: site.status,
        timezone: site.timezone,
        countryCode: site.countryCode,
        gatewaysTotal: site.gateways.length,
        gatewaysOnline: site.gateways.filter((gateway) => gateway.status === "online").length,
        createdAt: site.createdAt.toISOString(),
      };
    });
  }

  async archiveSite(tenantId: string, siteId: string): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const site = await transaction.site.update({
        where: { tenantId_id: { tenantId, id: siteId } },
        data: { archivedAt: new Date(), status: "archived" },
      });
      return { id: site.id, archived: true };
    });
  }

  async listGateways(tenantId: string): Promise<unknown[]> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const gateways = await transaction.gateway.findMany({
        where: { tenantId, retiredAt: null },
        orderBy: { createdAt: "desc" },
        include: { site: { select: { id: true, name: true, code: true } } },
      });
      return gateways.map((gateway) => ({
        id: gateway.id,
        siteId: gateway.siteId,
        siteName: gateway.site.name,
        siteCode: gateway.site.code,
        name: gateway.name,
        model: gateway.model,
        serial: gateway.serial,
        nasIdentifier: gateway.nasIdentifier,
        status: gateway.status,
        routerOsVersion: gateway.routerOsVersion,
        lastSeenAt: gateway.lastSeenAt?.toISOString() ?? null,
        createdAt: gateway.createdAt.toISOString(),
      }));
    });
  }

  async createGateway(tenantId: string, input: CreateGatewayInput): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const site = await transaction.site.findFirst({
        where: { tenantId, id: input.siteId, archivedAt: null },
        select: { id: true, name: true, code: true },
      });
      if (!site) throw new NotFoundException("Sede no encontrada");

      const gateway = await transaction.gateway
        .create({
          data: {
            tenantId,
            siteId: site.id,
            name: input.name,
            ...(input.model ? { model: input.model } : {}),
            ...(input.serial ? { serial: input.serial } : {}),
            nasIdentifier: input.nasIdentifier,
            status: "pending",
          },
        })
        .catch((error: unknown) => {
          if (isUniqueConstraintError(error)) {
            throw new ConflictException(
              "Ya existe un gateway con ese NAS Identifier. Edita el gateway existente o usa otro identificador.",
            );
          }
          throw error;
        });
      return {
        id: gateway.id,
        siteId: gateway.siteId,
        siteName: site.name,
        siteCode: site.code,
        name: gateway.name,
        model: gateway.model,
        serial: gateway.serial,
        nasIdentifier: gateway.nasIdentifier,
        status: gateway.status,
        routerOsVersion: gateway.routerOsVersion,
        lastSeenAt: null,
        createdAt: gateway.createdAt.toISOString(),
      };
    });
  }

  async updateGateway(
    tenantId: string,
    gatewayId: string,
    input: UpdateGatewayInput,
  ): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const current = await transaction.gateway.findFirst({
        where: { tenantId, id: gatewayId, retiredAt: null },
      });
      if (!current) throw new NotFoundException("Gateway no encontrado");
      if (input.siteId) {
        const site = await transaction.site.findFirst({
          where: { tenantId, id: input.siteId, archivedAt: null },
        });
        if (!site) throw new NotFoundException("Sede no encontrada");
      }
      const gateway = await transaction.gateway
        .update({
          where: { tenantId_id: { tenantId, id: gatewayId } },
          data: {
            ...(input.siteId === undefined ? {} : { siteId: input.siteId }),
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.nasIdentifier === undefined ? {} : { nasIdentifier: input.nasIdentifier }),
            ...(input.model === undefined ? {} : { model: input.model || null }),
            ...(input.serial === undefined ? {} : { serial: input.serial || null }),
            ...(input.status === undefined ? {} : { status: input.status }),
          },
          include: { site: { select: { id: true, name: true, code: true } } },
        })
        .catch((error: unknown) => {
          if (isUniqueConstraintError(error)) {
            throw new ConflictException("Ya existe un gateway con ese NAS Identifier");
          }
          throw error;
        });
      return {
        id: gateway.id,
        siteId: gateway.siteId,
        siteName: gateway.site.name,
        siteCode: gateway.site.code,
        name: gateway.name,
        model: gateway.model,
        serial: gateway.serial,
        nasIdentifier: gateway.nasIdentifier,
        status: gateway.status,
        routerOsVersion: gateway.routerOsVersion,
        lastSeenAt: gateway.lastSeenAt?.toISOString() ?? null,
        createdAt: gateway.createdAt.toISOString(),
      };
    });
  }

  async archiveGateway(tenantId: string, gatewayId: string): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const gateway = await transaction.gateway.update({
        where: { tenantId_id: { tenantId, id: gatewayId } },
        data: { retiredAt: new Date(), status: "retired" },
      });
      return { id: gateway.id, archived: true };
    });
  }

  async createGatewayLinkMaterial(
    tenantId: string,
    gatewayId: string,
    input: CreateGatewayLinkInput,
  ): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const gateway = await transaction.gateway.findFirst({
        where: { tenantId, id: gatewayId, retiredAt: null },
        include: { site: { select: { name: true, code: true } } },
      });
      if (!gateway) throw new NotFoundException("Gateway no encontrado");

      await transaction.radiusNasRegistry
        .upsert({
          where: { tenantId_gatewayId: { tenantId, gatewayId } },
          update: { nasIdentifier: gateway.nasIdentifier, active: true },
          create: {
            tenantId,
            gatewayId,
            nasIdentifier: gateway.nasIdentifier,
            active: true,
          },
        })
        .catch((error: unknown) => {
          if (isUniqueConstraintError(error)) {
            throw new ConflictException("Ese NAS Identifier está asociado a otro gateway");
          }
          throw error;
        });

      const gatewayLocator = generateOpaqueToken(32);
      const radiusSecret = generateOpaqueToken(32);
      const normalizedDnsName = input.hotspotDnsName.toLowerCase();
      const allowedLoginOrigins = [`http://${normalizedDnsName}`, `https://${normalizedDnsName}`];
      await transaction.gatewayCaptiveLocator.create({
        data: {
          tenantId,
          gatewayId,
          locatorHash: Buffer.from(
            keyedDigest(gatewayLocator, this.captiveIdentifierKey, "captive.gateway-locator.v1"),
          ),
          allowedLoginOrigins,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60_000),
        },
      });

      const radiusClientName = gateway.nasIdentifier.replace(/[^A-Za-z0-9_.-]/g, "-");
      return {
        gatewayId: gateway.id,
        gatewayName: gateway.name,
        siteName: gateway.site.name,
        nasIdentifier: gateway.nasIdentifier,
        tunnelClientIp: input.tunnelClientIp,
        hotspotDnsName: normalizedDnsName,
        gatewayLocator,
        radiusSecret,
        radiusClientLine: `${radiusClientName}\t${input.tunnelClientIp}\t${radiusSecret}`,
        allowedLoginOrigins,
      };
    });
  }

  async listPolicies(tenantId: string): Promise<unknown[]> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const policies = await transaction.accessPolicy.findMany({
        where: { tenantId, archivedAt: null },
        orderBy: { createdAt: "desc" },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      return policies.map((policy) => {
        const version = policy.versions[0];
        return {
          id: policy.id,
          name: policy.name,
          status: policy.status,
          versionId: version?.id ?? null,
          version: version?.version ?? null,
          versionStatus: version?.status ?? null,
          downloadKbps: version?.downloadKbps ?? null,
          uploadKbps: version?.uploadKbps ?? null,
          sessionTimeoutSeconds: version?.sessionTimeoutSeconds ?? null,
          quotaBytes: version?.quotaBytes?.toString() ?? null,
          maxConcurrentDevices: version?.maxConcurrentDevices ?? null,
          createdAt: policy.createdAt.toISOString(),
        };
      });
    });
  }

  async createPolicy(tenantId: string, input: CreatePolicyInput): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const policy = await transaction.accessPolicy.create({
        data: { tenantId, name: input.name, status: "active" },
      });
      const version = await transaction.accessPolicyVersion.create({
        data: {
          tenantId,
          policyId: policy.id,
          version: 1,
          status: "published",
          publishedAt: new Date(),
          sessionTimeoutSeconds: (input.sessionTimeoutHours ?? 24) * 3600,
          ...(input.downloadKbps === undefined ? {} : { downloadKbps: input.downloadKbps }),
          ...(input.uploadKbps === undefined ? {} : { uploadKbps: input.uploadKbps }),
          ...(input.quotaGb === undefined
            ? {}
            : { quotaBytes: BigInt(input.quotaGb) * 1024n ** 3n }),
          maxConcurrentDevices: input.maxConcurrentDevices ?? 1,
          snapshot: {
            createdFrom: "admin-mvp",
            downloadKbps: input.downloadKbps ?? null,
            uploadKbps: input.uploadKbps ?? null,
            quotaGb: input.quotaGb ?? null,
          },
        },
      });
      return {
        id: policy.id,
        name: policy.name,
        status: policy.status,
        versionId: version.id,
        version: version.version,
        versionStatus: version.status,
        downloadKbps: version.downloadKbps,
        uploadKbps: version.uploadKbps,
        sessionTimeoutSeconds: version.sessionTimeoutSeconds,
        quotaBytes: version.quotaBytes?.toString() ?? null,
        maxConcurrentDevices: version.maxConcurrentDevices,
        createdAt: policy.createdAt.toISOString(),
      };
    });
  }

  async updatePolicy(
    tenantId: string,
    policyId: string,
    input: UpdatePolicyInput,
  ): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const policy = await transaction.accessPolicy.findFirst({
        where: { tenantId, id: policyId, archivedAt: null },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      if (!policy) throw new NotFoundException("Política no encontrada");
      const previous = policy.versions[0];
      if (input.name !== undefined) {
        await transaction.accessPolicy.update({
          where: { tenantId_id: { tenantId, id: policyId } },
          data: { name: input.name },
        });
      }
      const version = await transaction.accessPolicyVersion.create({
        data: {
          tenantId,
          policyId,
          version: (previous?.version ?? 0) + 1,
          status: "published",
          publishedAt: new Date(),
          sessionTimeoutSeconds:
            (input.sessionTimeoutHours ?? (previous?.sessionTimeoutSeconds ?? 86_400) / 3600) *
            3600,
          ...(input.downloadKbps === undefined
            ? previous?.downloadKbps === null || previous?.downloadKbps === undefined
              ? {}
              : { downloadKbps: previous.downloadKbps }
            : { downloadKbps: input.downloadKbps }),
          ...(input.uploadKbps === undefined
            ? previous?.uploadKbps === null || previous?.uploadKbps === undefined
              ? {}
              : { uploadKbps: previous.uploadKbps }
            : { uploadKbps: input.uploadKbps }),
          ...(input.quotaGb === undefined
            ? previous?.quotaBytes === null || previous?.quotaBytes === undefined
              ? {}
              : { quotaBytes: previous.quotaBytes }
            : { quotaBytes: BigInt(input.quotaGb) * 1024n ** 3n }),
          maxConcurrentDevices: input.maxConcurrentDevices ?? previous?.maxConcurrentDevices ?? 1,
          snapshot: { updatedFrom: "admin-mvp" },
        },
      });
      return {
        id: policy.id,
        name: input.name ?? policy.name,
        status: policy.status,
        versionId: version.id,
        version: version.version,
        versionStatus: version.status,
        downloadKbps: version.downloadKbps,
        uploadKbps: version.uploadKbps,
        sessionTimeoutSeconds: version.sessionTimeoutSeconds,
        quotaBytes: version.quotaBytes?.toString() ?? null,
        maxConcurrentDevices: version.maxConcurrentDevices,
        createdAt: policy.createdAt.toISOString(),
      };
    });
  }

  async archivePolicy(tenantId: string, policyId: string): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const policy = await transaction.accessPolicy.update({
        where: { tenantId_id: { tenantId, id: policyId } },
        data: { archivedAt: new Date(), status: "archived" },
      });
      return { id: policy.id, archived: true };
    });
  }

  async listPortals(tenantId: string): Promise<unknown[]> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const portals = await transaction.portal.findMany({
        where: { tenantId, archivedAt: null },
        orderBy: { createdAt: "desc" },
        include: {
          versions: {
            orderBy: { version: "desc" },
            take: 1,
            include: { publications: { include: { site: { select: { name: true } } } } },
          },
        },
      });
      return portals.map((portal) => {
        const version = portal.versions[0];
        return {
          id: portal.id,
          name: portal.name,
          kind: portal.kind,
          versionId: version?.id ?? null,
          version: version?.version ?? null,
          status: version?.status ?? "draft",
          fallbackLocale: version?.fallbackLocale ?? "es",
          siteNames: version?.publications.map((publication) => publication.site.name) ?? [],
          createdAt: portal.createdAt.toISOString(),
        };
      });
    });
  }

  async createPortal(tenantId: string, input: CreatePortalInput): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const portal = await transaction.portal.create({
        data: { tenantId, name: input.name, kind: "wifi" },
      });
      const version = await transaction.portalVersion.create({
        data: {
          tenantId,
          portalId: portal.id,
          version: 1,
          status: "draft",
          fallbackLocale: "es",
          theme: { brand: "entelsat" },
        },
      });
      await transaction.portalBlock.createMany({
        data: [
          {
            tenantId,
            portalVersionId: version.id,
            kind: "hero",
            displayOrder: 10,
            props: {
              headline: input.headline ?? "Bienvenido al WiFi",
              body: input.body ?? "Acepta las condiciones para acceder a Internet.",
            },
          },
          {
            tenantId,
            portalVersionId: version.id,
            kind: "accept_button",
            displayOrder: 20,
            props: { label: "Acceder a Internet" },
          },
        ],
      });
      return {
        id: portal.id,
        name: portal.name,
        kind: portal.kind,
        versionId: version.id,
        version: version.version,
        status: version.status,
        fallbackLocale: version.fallbackLocale,
        siteNames: [],
        createdAt: portal.createdAt.toISOString(),
      };
    });
  }

  async updatePortal(
    tenantId: string,
    portalId: string,
    input: UpdatePortalInput,
  ): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const portal = await transaction.portal.findFirst({
        where: { tenantId, id: portalId, archivedAt: null },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      if (!portal) throw new NotFoundException("Portal no encontrado");
      if (input.name !== undefined) {
        await transaction.portal.update({
          where: { tenantId_id: { tenantId, id: portalId } },
          data: { name: input.name },
        });
      }
      const currentVersion = portal.versions[0];
      const version =
        currentVersion?.status === "draft"
          ? currentVersion
          : await transaction.portalVersion.create({
              data: {
                tenantId,
                portalId,
                version: (currentVersion?.version ?? 0) + 1,
                status: "draft",
                fallbackLocale: currentVersion?.fallbackLocale ?? "es",
                theme: currentVersion?.theme ?? { brand: "entelsat" },
              },
            });
      await transaction.portalBlock.deleteMany({
        where: { tenantId, portalVersionId: version.id },
      });
      await transaction.portalBlock.createMany({
        data: [
          {
            tenantId,
            portalVersionId: version.id,
            kind: "hero",
            displayOrder: 10,
            props: {
              headline: input.headline ?? "Bienvenido al WiFi",
              body: input.body ?? "Acepta las condiciones para acceder a Internet.",
            },
          },
          {
            tenantId,
            portalVersionId: version.id,
            kind: "accept_button",
            displayOrder: 20,
            props: { label: "Acceder a Internet" },
          },
        ],
      });
      return {
        id: portal.id,
        name: input.name ?? portal.name,
        kind: portal.kind,
        versionId: version.id,
        version: version.version,
        status: version.status,
        fallbackLocale: version.fallbackLocale,
        siteNames: [],
        createdAt: portal.createdAt.toISOString(),
      };
    });
  }

  async archivePortal(tenantId: string, portalId: string): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const portal = await transaction.portal.update({
        where: { tenantId_id: { tenantId, id: portalId } },
        data: { archivedAt: new Date() },
      });
      return { id: portal.id, archived: true };
    });
  }

  async listVoucherBatches(tenantId: string): Promise<unknown[]> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const batches = await transaction.voucherBatch.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        include: {
          site: { select: { name: true, code: true } },
          policyVersion: { include: { policy: { select: { name: true } } } },
          vouchers: { select: { id: true, state: true, usedCount: true, revokedAt: true } },
        },
      });
      return batches.map((batch) => ({
        id: batch.id,
        name: batch.name,
        siteName: batch.site.name,
        siteCode: batch.site.code,
        policyName: batch.policyVersion.policy.name,
        quantity: batch.quantity,
        available: batch.vouchers.filter(
          (voucher) => voucher.state === "available" && !voucher.revokedAt,
        ).length,
        used: batch.vouchers.filter((voucher) => voucher.usedCount > 0).length,
        expiresAt: batch.expiresAt.toISOString(),
        createdAt: batch.createdAt.toISOString(),
      }));
    });
  }

  async createVoucherBatch(tenantId: string, input: CreateVoucherBatchInput): Promise<unknown> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const site = await transaction.site.findFirst({
        where: { tenantId, id: input.siteId, archivedAt: null },
        select: { id: true, name: true, code: true },
      });
      if (!site) throw new NotFoundException("Sede no encontrada");
      const policyVersion = await transaction.accessPolicyVersion.findFirst({
        where: { tenantId, id: input.policyVersionId },
        include: { policy: { select: { name: true } } },
      });
      if (!policyVersion) throw new NotFoundException("Política no encontrada");

      const startsAt = new Date();
      const expiresAt = new Date(input.expiresAt);
      const batch = await transaction.voucherBatch.create({
        data: {
          tenantId,
          siteId: site.id,
          policyVersionId: policyVersion.id,
          name: input.name,
          quantity: input.quantity,
          startsAt,
          expiresAt,
          defaultMaxUses: input.defaultMaxUses ?? 1,
          defaultMaxDevices: input.defaultMaxDevices ?? 1,
        },
      });
      const codes = Array.from({ length: input.quantity }, () => this.generateVoucherCode());
      await transaction.voucher.createMany({
        data: codes.map((code) => ({
          tenantId,
          batchId: batch.id,
          codeHmac: Buffer.from(keyedDigest(code, this.voucherKey, "voucher.code.v1")),
          displayHint: code.slice(-4),
          state: "available",
          maxUses: input.defaultMaxUses ?? 1,
          maxDevices: input.defaultMaxDevices ?? 1,
          expiresAt,
        })),
      });
      return {
        id: batch.id,
        name: batch.name,
        siteName: site.name,
        siteCode: site.code,
        policyName: policyVersion.policy.name,
        quantity: batch.quantity,
        available: batch.quantity,
        used: 0,
        expiresAt: batch.expiresAt.toISOString(),
        createdAt: batch.createdAt.toISOString(),
        oneTimeCodes: codes,
      };
    });
  }

  private generateVoucherCode(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const raw = randomBytes(12);
    const chars = Array.from(raw, (byte) => alphabet[byte % alphabet.length]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
  }
}
