import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { adminLoginSchema, type AdminLoginResult, type AdminSessionView } from "@wifi/contracts";
import {
  deriveScopedKey,
  generateOpaqueToken,
  keyedDigest,
  openSecretText,
  sealSecret,
  verifyAdminPassword,
  verifyTotp,
} from "@wifi/security";

import type { AppEnvironment } from "../config/environment.js";
import { DatabaseService } from "../infrastructure/database.service.js";
import { RedisService } from "../infrastructure/redis.service.js";

const DUMMY_PASSWORD_HASH =
  "$scrypt$ln=17,r=8,p=1,l=32$x2UcJHnyyImrSuAcaft76A$LWiizNuayS3RoJJ1HDnMsDkfMeNVZ0JUoXS78hqcp1Y";

interface AdminAuthRow {
  user_id: string;
  user_status: string;
  password_hash: string;
  hash_algorithm: string;
  failed_attempts: number;
  locked_until: Date | null;
  active_tenant_ids: string[];
}

interface AdminSessionRouteRow {
  session_id: string;
  user_id: string;
  auth_strength: AdminSessionView["authStrength"];
  idle_expires_at: Date;
  expires_at: Date;
  active_tenant_ids: string[];
}

export interface AdminRequestMetadata {
  ip: string;
  userAgent?: string;
}

export interface LoginOutcome {
  result: AdminLoginResult;
  sessionToken?: string;
  maxAgeSeconds?: number;
}

@Injectable()
export class AdminAuthService {
  private readonly emailKey: Buffer;
  private readonly sessionKey: Buffer;
  private readonly dataKey: Buffer;
  private readonly idleMinutes: number;
  private readonly absoluteHours: number;
  private readonly rememberHours: number;
  private readonly requireMfa: boolean;
  private readonly rateAttempts: number;
  private readonly rateWindow: number;

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.emailKey = Buffer.from(
      config.getOrThrow<string>("ADMIN_EMAIL_HMAC_KEY_BASE64"),
      "base64url",
    );
    this.sessionKey = Buffer.from(
      config.getOrThrow<string>("ADMIN_SESSION_HMAC_KEY_BASE64"),
      "base64url",
    );
    this.dataKey = Buffer.from(
      config.getOrThrow<string>("DATA_ENCRYPTION_MASTER_KEY_BASE64"),
      "base64url",
    );
    this.idleMinutes = config.get("ADMIN_SESSION_IDLE_MINUTES", { infer: true });
    this.absoluteHours = config.get("ADMIN_SESSION_ABSOLUTE_HOURS", { infer: true });
    this.rememberHours = config.get("ADMIN_REMEMBER_SESSION_HOURS", { infer: true });
    this.requireMfa = config.get("ADMIN_REQUIRE_MFA", { infer: true });
    this.rateAttempts = config.get("AUTH_RATE_LIMIT_ATTEMPTS", { infer: true });
    this.rateWindow = config.get("AUTH_RATE_LIMIT_WINDOW_SECONDS", { infer: true });
  }

  async login(raw: unknown, metadata: AdminRequestMetadata): Promise<LoginOutcome> {
    const request = adminLoginSchema.parse(raw);
    const emailHmac = keyedDigest(request.email, this.emailKey, "admin.email.v1");
    const rateKey = this.rateKey(emailHmac, metadata.ip);
    let attempts: number;
    try {
      attempts = await this.redis.incrementWindow(rateKey, this.rateWindow);
    } catch {
      throw new ServiceUnavailableException("El servicio de autenticación no está disponible");
    }
    if (attempts > this.rateAttempts) {
      throw new HttpException("Demasiados intentos", HttpStatus.TOO_MANY_REQUESTS);
    }

    const rows = await this.database.client.$queryRaw<AdminAuthRow[]>`
      SELECT user_id, user_status, password_hash, hash_algorithm,
             failed_attempts, locked_until, active_tenant_ids
        FROM app.lookup_admin_auth(${emailHmac})
    `;
    const auth = rows[0];
    const passwordMatches = await verifyAdminPassword(
      request.password,
      auth?.password_hash ?? DUMMY_PASSWORD_HASH,
    );
    const tenantId = auth?.active_tenant_ids[0];
    if (
      !auth ||
      !tenantId ||
      auth.user_status !== "active" ||
      auth.hash_algorithm !== "scrypt" ||
      (auth.locked_until !== null && auth.locked_until > new Date()) ||
      !passwordMatches
    ) {
      if (auth && tenantId && !passwordMatches) await this.recordFailure(tenantId, auth.user_id);
      throw new UnauthorizedException("Credenciales no válidas");
    }

    const factors = await this.database.withTenant(tenantId, (transaction) =>
      transaction.adminTotpFactor.findMany({
        where: { userId: auth.user_id, verifiedAt: { not: null }, revokedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, secretCiphertext: true },
      }),
    );
    if (factors.length === 0 && this.requireMfa) {
      throw new ServiceUnavailableException({
        message: "La cuenta requiere enrolamiento MFA antes de iniciar sesión",
        code: "ADMIN_MFA_ENROLLMENT_REQUIRED",
      });
    }
    if (factors.length > 0 && !request.totp) {
      return { result: { status: "mfa_required" } };
    }
    if (factors.length > 0) {
      const totpKey = deriveScopedKey(this.dataKey, auth.user_id, "admin-totp");
      const valid = factors.some((factor) => {
        try {
          return verifyTotp(
            request.totp ?? "",
            openSecretText(Buffer.from(factor.secretCiphertext), totpKey, "admin.totp.v1"),
          );
        } catch {
          return false;
        }
      });
      if (!valid) {
        await this.recordFailure(tenantId, auth.user_id);
        throw new UnauthorizedException("Credenciales no válidas");
      }
    }

    const now = new Date();
    const absoluteHours = request.remember ? this.rememberHours : this.absoluteHours;
    const expiresAt = new Date(now.getTime() + absoluteHours * 60 * 60_000);
    const idleExpiresAt = new Date(
      Math.min(expiresAt.getTime(), now.getTime() + this.idleMinutes * 60_000),
    );
    const sessionToken = generateOpaqueToken(32);
    const tokenHash = keyedDigest(sessionToken, this.sessionKey, "admin.session.v1");
    const userDataKey = deriveScopedKey(this.dataKey, auth.user_id, "admin-session-data");
    const userAgent = metadata.userAgent?.slice(0, 1_000);
    await this.database.withTenant(tenantId, async (transaction) => {
      await transaction.adminCredential.update({
        where: { userId: auth.user_id },
        data: { failedAttempts: 0, lockedUntil: null },
      });
      await transaction.adminSession.create({
        data: {
          userId: auth.user_id,
          tokenHash: Uint8Array.from(tokenHash),
          authStrength: factors.length > 0 ? "totp" : "password",
          ...(factors.length > 0 ? { mfaVerifiedAt: now } : {}),
          ipCiphertext: Uint8Array.from(
            sealSecret(metadata.ip, userDataKey, "admin.session.ip.v1"),
          ),
          ipHmac: Uint8Array.from(
            keyedDigest(metadata.ip, userDataKey, "admin.session.ip-hmac.v1"),
          ),
          ...(userAgent
            ? {
                userAgentCiphertext: Uint8Array.from(
                  sealSecret(userAgent, userDataKey, "admin.session.ua.v1"),
                ),
                userAgentHmac: Uint8Array.from(
                  keyedDigest(userAgent, userDataKey, "admin.session.ua-hmac.v1"),
                ),
              }
            : {}),
          idleExpiresAt,
          expiresAt,
        },
      });
    });
    const session = await this.buildSessionView(
      tenantId,
      auth.user_id,
      factors.length > 0 ? "totp" : "password",
      expiresAt,
    );
    return {
      result: { status: "authenticated", session },
      sessionToken,
      ...(request.remember ? { maxAgeSeconds: absoluteHours * 60 * 60 } : {}),
    };
  }

  async session(token: string): Promise<AdminSessionView> {
    const route = await this.resolveSession(token);
    const tenantId = route.active_tenant_ids[0];
    if (!tenantId) throw new UnauthorizedException("Sesión no válida");
    const now = new Date();
    const nextIdle = new Date(
      Math.min(route.expires_at.getTime(), now.getTime() + this.idleMinutes * 60_000),
    );
    await this.database.withTenant(tenantId, (transaction) =>
      transaction.adminSession.update({
        where: { id: route.session_id },
        data: { lastSeenAt: now, idleExpiresAt: nextIdle },
      }),
    );
    return this.buildSessionView(tenantId, route.user_id, route.auth_strength, route.expires_at);
  }

  async logout(token: string): Promise<void> {
    const route = await this.resolveSession(token);
    const tenantId = route.active_tenant_ids[0];
    if (!tenantId) return;
    await this.database.withTenant(tenantId, (transaction) =>
      transaction.adminSession.update({
        where: { id: route.session_id },
        data: { revokedAt: new Date(), revokeReason: "user_logout" },
      }),
    );
  }

  private async resolveSession(token: string): Promise<AdminSessionRouteRow> {
    if (Buffer.from(token, "base64url").byteLength !== 32) {
      throw new UnauthorizedException("Sesión no válida");
    }
    const tokenHash = keyedDigest(token, this.sessionKey, "admin.session.v1");
    const rows = await this.database.client.$queryRaw<AdminSessionRouteRow[]>`
      SELECT session_id, user_id, auth_strength, idle_expires_at,
             expires_at, active_tenant_ids
        FROM app.resolve_admin_session(${tokenHash})
    `;
    if (!rows[0]) throw new UnauthorizedException("Sesión no válida");
    return rows[0];
  }

  private async buildSessionView(
    tenantId: string,
    userId: string,
    authStrength: AdminSessionView["authStrength"],
    expiresAt: Date,
  ): Promise<AdminSessionView> {
    return this.database.withTenant(tenantId, async (transaction) => {
      const tenant = await transaction.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });
      const membership = await transaction.tenantMembership.findFirst({
        where: { tenantId, userId, status: "active" },
        include: {
          assignments: {
            where: {
              startsAt: { lte: new Date() },
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            include: { role: { include: { permissions: true } } },
          },
        },
      });
      if (!tenant || !membership) throw new UnauthorizedException("Sesión no válida");
      const permissions = [
        ...new Set(
          membership.assignments.flatMap((assignment) =>
            assignment.role.permissions.map((permission) => permission.permissionCode),
          ),
        ),
      ].sort();
      return {
        userId,
        tenantId,
        tenantName: tenant.name,
        membershipId: membership.id,
        authStrength,
        permissions,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  private async recordFailure(tenantId: string, userId: string): Promise<void> {
    await this.database.withTenant(tenantId, async (transaction) => {
      const credential = await transaction.adminCredential.update({
        where: { userId },
        data: { failedAttempts: { increment: 1 } },
        select: { failedAttempts: true },
      });
      if (credential.failedAttempts >= 5) {
        await transaction.adminCredential.update({
          where: { userId },
          data: { lockedUntil: new Date(Date.now() + 15 * 60_000) },
        });
      }
    });
  }

  private rateKey(emailHmac: Buffer, ip: string): string {
    return `wifi:auth:${keyedDigest(
      `${emailHmac.toString("base64url")}|${ip}`,
      this.emailKey,
      "admin.rate-limit.v1",
    ).toString("base64url")}`;
  }
}
