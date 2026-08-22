import { Body, Controller, Get, Post, Req } from "@nestjs/common";
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
