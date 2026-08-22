import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AdminSessionView, PermissionId } from "@wifi/contracts";
import type { FastifyRequest } from "fastify";

import type { AppEnvironment } from "../config/environment.js";
import { AdminAuthService } from "../auth/admin-auth.service.js";

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

export class AdminSessionReader {
  private readonly cookieName: string;

  constructor(
    private readonly auth: AdminAuthService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    const secureCookie = config.get("NODE_ENV", { infer: true }) === "production";
    this.cookieName = secureCookie ? "__Host-wifi_session" : "wifi_session";
  }

  async requireSession(
    request: FastifyRequest,
    permissions: readonly PermissionId[],
  ): Promise<AdminSessionView> {
    const token = parseCookie(request.headers.cookie, this.cookieName);
    if (!token) throw new UnauthorizedException("Sesión no válida");
    const session = await this.auth.session(token);
    const granted = new Set(session.permissions);
    if (!permissions.every((permission) => granted.has(permission))) {
      throw new ForbiddenException("Permisos insuficientes");
    }
    return session;
  }
}
