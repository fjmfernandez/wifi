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

  @Get("oauth/google/start")
  async googleOAuthStart(
    @Query("state") state: unknown,
    @Query("acceptedLegalVersionId") acceptedLegalVersionId: unknown,
    @Query("locale") locale: unknown,
    @Res() response: FastifyReply,
  ): Promise<void> {
    const location = await this.captive.googleOAuthStart({
      state,
      acceptedLegalVersionId,
      locale,
    });
    await response.status(303).header("location", location).send();
  }

  @Get("oauth/google/callback")
  @Header("Cache-Control", "no-store")
  async googleOAuthCallback(
    @Query("state") state: unknown,
    @Query("code") code: unknown,
    @Query("error") error: unknown,
    @Res() response: FastifyReply,
  ): Promise<void> {
    const html = await this.captive.googleOAuthCallback({ state, code, error });
    await response.type("text/html; charset=utf-8").send(html);
  }
}
