import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { AdminAuthService } from "../auth/admin-auth.service.js";
import type { AppEnvironment } from "../config/environment.js";
import { AdminOperationsService } from "./admin-operations.service.js";
import { AdminSessionReader } from "./admin-session.js";

const siteInputSchema = z.object({
  organizationId: z.uuid().optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Z0-9][A-Z0-9_-]*$/i)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(160),
  countryCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase()),
  timezone: z.string().trim().min(3).max(64).default("Europe/Madrid"),
});

const gatewayInputSchema = z.object({
  siteId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  nasIdentifier: z.string().trim().min(3).max(128),
  model: z.string().trim().max(100).optional(),
  serial: z.string().trim().max(100).optional(),
});

const gatewayUpdateSchema = gatewayInputSchema
  .extend({
    status: z.enum(["pending", "online", "degraded", "offline", "retired"]).optional(),
  })
  .partial();

const organizationInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Z0-9][A-Z0-9_-]*$/i)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200).optional(),
});

const policyInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  downloadKbps: z.coerce.number().int().min(64).max(1_000_000).optional(),
  uploadKbps: z.coerce.number().int().min(64).max(1_000_000).optional(),
  sessionTimeoutHours: z.coerce.number().int().min(1).max(8760).optional(),
  quotaGb: z.coerce.number().int().min(1).max(100_000).optional(),
  maxConcurrentDevices: z.coerce.number().int().min(1).max(100).optional(),
});

const portalInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  headline: z.string().trim().max(160).optional(),
  body: z.string().trim().max(500).optional(),
});

const voucherBatchInputSchema = z.object({
  siteId: z.uuid(),
  policyVersionId: z.uuid(),
  name: z.string().trim().min(2).max(160),
  quantity: z.coerce.number().int().min(1).max(250),
  expiresAt: z.string().datetime(),
  defaultMaxUses: z.coerce.number().int().min(1).max(100).optional(),
  defaultMaxDevices: z.coerce.number().int().min(1).max(20).optional(),
});

const idParamSchema = z.uuid();
const siteUpdateSchema = siteInputSchema.partial();
const organizationUpdateSchema = organizationInputSchema.partial();
const policyUpdateSchema = policyInputSchema.partial();
const portalUpdateSchema = portalInputSchema.partial();

@Controller("admin")
export class AdminOperationsController {
  private readonly sessions: AdminSessionReader;

  constructor(
    private readonly operations: AdminOperationsService,
    auth: AdminAuthService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.sessions = new AdminSessionReader(auth, config);
  }

  @Get("organizations")
  async listOrganizations(@Req() request: FastifyRequest): Promise<unknown[]> {
    const session = await this.sessions.requireSession(request, ["organization.read"]);
    return this.operations.listOrganizations(session.tenantId);
  }

  @Post("organizations")
  async createOrganization(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
  ): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["organization.create"]);
    return this.operations.createOrganization(
      session.tenantId,
      organizationInputSchema.parse(body),
    );
  }

  @Patch("organizations/:id")
  async updateOrganization(
    @Req() request: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["organization.update"]);
    return this.operations.updateOrganization(
      session.tenantId,
      idParamSchema.parse(id),
      organizationUpdateSchema.parse(body),
    );
  }

  @Delete("organizations/:id")
  async archiveOrganization(
    @Req() request: FastifyRequest,
    @Param("id") id: string,
  ): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["organization.delete"]);
    return this.operations.archiveOrganization(session.tenantId, idParamSchema.parse(id));
  }

  @Get("sites")
  async listSites(@Req() request: FastifyRequest): Promise<unknown[]> {
    const session = await this.sessions.requireSession(request, ["site.read"]);
    return this.operations.listSites(session.tenantId);
  }

  @Post("sites")
  async createSite(@Req() request: FastifyRequest, @Body() body: unknown): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["site.create"]);
    return this.operations.createSite(session.tenantId, siteInputSchema.parse(body));
  }

  @Patch("sites/:id")
  async updateSite(
    @Req() request: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["site.update"]);
    return this.operations.updateSite(
      session.tenantId,
      idParamSchema.parse(id),
      siteUpdateSchema.parse(body),
    );
  }

  @Delete("sites/:id")
  async archiveSite(@Req() request: FastifyRequest, @Param("id") id: string): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["site.delete"]);
    return this.operations.archiveSite(session.tenantId, idParamSchema.parse(id));
  }

  @Get("gateways")
  async listGateways(@Req() request: FastifyRequest): Promise<unknown[]> {
    const session = await this.sessions.requireSession(request, ["gateway.read"]);
    return this.operations.listGateways(session.tenantId);
  }

  @Post("gateways")
  async createGateway(@Req() request: FastifyRequest, @Body() body: unknown): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["gateway.create"]);
    return this.operations.createGateway(session.tenantId, gatewayInputSchema.parse(body));
  }

  @Patch("gateways/:id")
  async updateGateway(
    @Req() request: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["gateway.update"]);
    return this.operations.updateGateway(
      session.tenantId,
      idParamSchema.parse(id),
      gatewayUpdateSchema.parse(body),
    );
  }

  @Delete("gateways/:id")
  async archiveGateway(@Req() request: FastifyRequest, @Param("id") id: string): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["gateway.delete"]);
    return this.operations.archiveGateway(session.tenantId, idParamSchema.parse(id));
  }

  @Get("policies")
  async listPolicies(@Req() request: FastifyRequest): Promise<unknown[]> {
    const session = await this.sessions.requireSession(request, ["access_policy.read"]);
    return this.operations.listPolicies(session.tenantId);
  }

  @Post("policies")
  async createPolicy(@Req() request: FastifyRequest, @Body() body: unknown): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["access_policy.create"]);
    return this.operations.createPolicy(session.tenantId, policyInputSchema.parse(body));
  }

  @Patch("policies/:id")
  async updatePolicy(
    @Req() request: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["access_policy.update"]);
    return this.operations.updatePolicy(
      session.tenantId,
      idParamSchema.parse(id),
      policyUpdateSchema.parse(body),
    );
  }

  @Delete("policies/:id")
  async archivePolicy(@Req() request: FastifyRequest, @Param("id") id: string): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["access_policy.delete"]);
    return this.operations.archivePolicy(session.tenantId, idParamSchema.parse(id));
  }

  @Get("portals")
  async listPortals(@Req() request: FastifyRequest): Promise<unknown[]> {
    const session = await this.sessions.requireSession(request, ["portal.read"]);
    return this.operations.listPortals(session.tenantId);
  }

  @Post("portals")
  async createPortal(@Req() request: FastifyRequest, @Body() body: unknown): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["portal.create"]);
    return this.operations.createPortal(session.tenantId, portalInputSchema.parse(body));
  }

  @Patch("portals/:id")
  async updatePortal(
    @Req() request: FastifyRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["portal.update"]);
    return this.operations.updatePortal(
      session.tenantId,
      idParamSchema.parse(id),
      portalUpdateSchema.parse(body),
    );
  }

  @Delete("portals/:id")
  async archivePortal(@Req() request: FastifyRequest, @Param("id") id: string): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["portal.delete"]);
    return this.operations.archivePortal(session.tenantId, idParamSchema.parse(id));
  }

  @Get("voucher-batches")
  async listVoucherBatches(@Req() request: FastifyRequest): Promise<unknown[]> {
    const session = await this.sessions.requireSession(request, ["voucher.read"]);
    return this.operations.listVoucherBatches(session.tenantId);
  }

  @Post("voucher-batches")
  async createVoucherBatch(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
  ): Promise<unknown> {
    const session = await this.sessions.requireSession(request, ["voucher.create"]);
    return this.operations.createVoucherBatch(
      session.tenantId,
      voucherBatchInputSchema.parse(body),
    );
  }
}
