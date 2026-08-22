import { Body, Controller, Get, Header, Post, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";

import { CaptiveService } from "./captive.service.js";

@Controller("captive")
export class CaptiveController {
  constructor(private readonly captive: CaptiveService) {}

  @Post("session/start")
  async start(@Body() body: unknown, @Res() response: FastifyReply): Promise<void> {
    const result = await this.captive.start(body);
    await response.status(303).header("location", result.portalUrl).send();
  }

  @Post("gateway/ping")
  @Header("Cache-Control", "no-store")
  gatewayPing(@Body() body: unknown): Promise<unknown> {
    return this.captive.gatewayPing(body);
  }

  @Get("gateway/ping")
  @Header("Cache-Control", "no-store")
  gatewayPingGet(@Query("gatewayLocator") gatewayLocator: unknown): Promise<unknown> {
    return this.captive.gatewayPing({ gatewayLocator });
  }

  @Get("context")
  @Header("Cache-Control", "no-store")
  context(@Query("state") state: unknown): Promise<unknown> {
    return this.captive.context(state);
  }

  @Get("legal")
  @Header("Cache-Control", "private, no-store")
  legal(
    @Query("state") state: unknown,
    @Query("version") version: unknown,
    @Query("locale") locale: unknown,
  ): Promise<unknown> {
    return this.captive.legal(state, version, locale);
  }

  @Post("authorize")
  @Header("Cache-Control", "no-store")
  authorize(@Body() body: unknown): Promise<unknown> {
    return this.captive.authorize(body);
  }
}
