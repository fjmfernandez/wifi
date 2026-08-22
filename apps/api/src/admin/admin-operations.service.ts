import { Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../infrastructure/database.service.js";

export interface CreateSiteInput {
  code: string;
  name: string;
  countryCode: string;
  timezone: string;
}

export interface CreateGatewayInput {
  siteId: string;
  name: string;
  nasIdentifier: string;
  model?: string | undefined;
  serial?: string | undefined;
}

@Injectable()
export class AdminOperationsService {
  constructor(private readonly database: DatabaseService) {}

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
        (await transaction.organization.findFirst({
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

      const gateway = await transaction.gateway.create({
        data: {
          tenantId,
          siteId: site.id,
          name: input.name,
          ...(input.model ? { model: input.model } : {}),
          ...(input.serial ? { serial: input.serial } : {}),
          nasIdentifier: input.nasIdentifier,
          status: "pending",
        },
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
}
