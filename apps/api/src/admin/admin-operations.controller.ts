import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { AdminAuthService } from "../auth/admin-auth.service.js";
import type { AppEnvironment } from "../config/environment.js";
import { AdminOperationsService } from "./admin-operations.service.js";
import { AdminSessionReader } from "./admin-session.js";

const siteInputSchema = z.object({
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
}
