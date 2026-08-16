import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppEnvironment } from "../config/environment.js";
import { AdminAuthService } from "./admin-auth.service.js";

function parseCookie(header: string | undefined, name: string): string | undefined {
  for (const item of header?.split(";") ?? []) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    if (item.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(item.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

@Controller("auth/admin")
export class AdminAuthController {
  private readonly adminOrigin: string;
  private readonly cookieName: string;
  private readonly secureCookie: boolean;

  constructor(
    private readonly auth: AdminAuthService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.adminOrigin = new URL(config.getOrThrow<string>("ADMIN_PUBLIC_ORIGIN")).origin;
    this.secureCookie = config.get("NODE_ENV", { infer: true }) === "production";
    this.cookieName = this.secureCookie ? "__Host-wifi_session" : "wifi_session";
  }

  @Post("login")
  @Header("Cache-Control", "no-store")
  async login(@Req() request: FastifyRequest, @Res() response: FastifyReply): Promise<void> {
    this.assertOrigin(request);
    const outcome = await this.auth.login(request.body, {
      ip: request.ip,
      ...(typeof request.headers["user-agent"] === "string"
        ? { userAgent: request.headers["user-agent"] }
        : {}),
    });
    if (outcome.result.status === "mfa_required") {
      await response.status(202).send(outcome.result);
      return;
    }
    if (!outcome.sessionToken) throw new Error("SESSION_TOKEN_MISSING");
    response.header("set-cookie", this.sessionCookie(outcome.sessionToken, outcome.maxAgeSeconds));
    await response.status(200).send(outcome.result);
  }

  @Get("session")
  @Header("Cache-Control", "no-store")
  session(@Req() request: FastifyRequest): Promise<unknown> {
    return this.auth.session(this.requiredSessionToken(request));
  }

  @Post("logout")
  @Header("Cache-Control", "no-store")
  async logout(@Req() request: FastifyRequest, @Res() response: FastifyReply): Promise<void> {
    this.assertOrigin(request);
    const token = parseCookie(request.headers.cookie, this.cookieName);
    if (token) await this.auth.logout(token).catch(() => undefined);
    response.header("set-cookie", this.expiredSessionCookie());
    await response.status(204).send();
  }

  private requiredSessionToken(request: FastifyRequest): string {
    const token = parseCookie(request.headers.cookie, this.cookieName);
    if (!token) throw new UnauthorizedException("Sesión no válida");
    return token;
  }

  private assertOrigin(request: FastifyRequest): void {
    const origin = request.headers.origin;
    if (typeof origin !== "string") throw new ForbiddenException("Origen no permitido");
    try {
      if (new URL(origin).origin !== this.adminOrigin) {
        throw new ForbiddenException("Origen no permitido");
      }
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ForbiddenException("Origen no permitido");
    }
  }

  private sessionCookie(token: string, maxAgeSeconds?: number): string {
    return [
      `${this.cookieName}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      ...(this.secureCookie ? ["Secure"] : []),
      ...(maxAgeSeconds === undefined ? [] : [`Max-Age=${maxAgeSeconds}`]),
    ].join("; ");
  }

  private expiredSessionCookie(): string {
    return [
      `${this.cookieName}=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      ...(this.secureCookie ? ["Secure"] : []),
      "Max-Age=0",
    ].join("; ");
  }
}
