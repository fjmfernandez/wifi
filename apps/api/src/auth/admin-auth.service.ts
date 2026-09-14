import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  adminLoginSchema,
  normalizedAdminEmailSchema,
  type AdminLoginResult,
  type AdminSessionView,
} from "@wifi/contracts";
import {
  deriveScopedKey,
  generateOpaqueToken,
  keyedDigest,
  openSecretText,
  sealSecret,
  verifyAdminPassword,
  verifyTotp,
} from "@wifi/security";
import { z } from "zod";

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

interface AdminGoogleOAuthState {
  returnTo: string;
  expiresAt: number;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  email?: string;
  email_verified?: boolean;
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
  private readonly adminOrigin: string;
  private readonly googleOAuthEnabled: boolean;
  private readonly googleOAuthClientId?: string;
  private readonly googleOAuthClientSecret?: string;
  private readonly googleOAuthRedirectUri: string;
  private readonly googleAllowedEmails: Set<string>;

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
    this.adminOrigin = new URL(config.getOrThrow<string>("ADMIN_PUBLIC_ORIGIN")).origin;
    this.googleOAuthEnabled = config.get("ADMIN_GOOGLE_LOGIN_ENABLED", { infer: true });
    this.googleOAuthClientId = config.get("GOOGLE_OAUTH_CLIENT_ID", { infer: true });
    this.googleOAuthClientSecret = config.get("GOOGLE_OAUTH_CLIENT_SECRET", { infer: true });
    this.googleOAuthRedirectUri = new URL(
      "/api/v1/auth/admin/oauth/google/callback",
      this.adminOrigin,
    ).toString();
    this.googleAllowedEmails = new Set(
      config
        .get("ADMIN_GOOGLE_ALLOWED_EMAILS", { infer: true })
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
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

    await this.database.withTenant(tenantId, (transaction) =>
      transaction.adminCredential.update({
        where: { userId: auth.user_id },
        data: { failedAttempts: 0, lockedUntil: null },
      }),
    );
    const created = await this.createSession(
      tenantId,
      auth.user_id,
      factors.length > 0 ? "totp" : "password",
      metadata,
      request.remember,
    );
    return {
      result: { status: "authenticated", session: created.session },
      sessionToken: created.sessionToken,
      ...(created.maxAgeSeconds ? { maxAgeSeconds: created.maxAgeSeconds } : {}),
    };
  }

  googleOAuthStart(rawReturnTo: unknown): string {
    if (!this.googleOAuthEnabled || !this.googleOAuthClientId || !this.googleOAuthClientSecret) {
      throw new ServiceUnavailableException("Google Login no está configurado");
    }
    const returnTo =
      typeof rawReturnTo === "string" &&
      rawReturnTo.startsWith("/") &&
      !rawReturnTo.startsWith("//")
        ? rawReturnTo
        : "/administracion";
    const state = this.signGoogleState({ returnTo, expiresAt: Date.now() + 5 * 60_000 });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.googleOAuthClientId);
    url.searchParams.set("redirect_uri", this.googleOAuthRedirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }

  async googleOAuthCallback(
    raw: unknown,
    metadata: AdminRequestMetadata,
  ): Promise<LoginOutcome & { returnTo: string }> {
    if (!this.googleOAuthEnabled || !this.googleOAuthClientId || !this.googleOAuthClientSecret) {
      throw new ServiceUnavailableException("Google Login no está configurado");
    }
    const query = z
      .object({
        state: z.string().min(32).max(4096),
        code: z.string().min(8).max(4096).optional(),
        error: z.string().max(256).optional(),
      })
      .parse(raw);
    const state = this.verifyGoogleState(query.state);
    if (query.error || !query.code) throw new UnauthorizedException("Google Login cancelado");
    const tokens = await this.exchangeGoogleCode(query.code);
    if (!tokens.access_token) throw new UnauthorizedException("Google no ha emitido token válido");
    const profile = await this.loadGoogleUserInfo(tokens.access_token);
    if (!profile.email || profile.email_verified !== true) {
      throw new UnauthorizedException("Google no ha verificado el email");
    }
    const email = normalizedAdminEmailSchema.parse(profile.email);
    if (this.googleAllowedEmails.size > 0 && !this.googleAllowedEmails.has(email)) {
      throw new UnauthorizedException("Este email de Google no está autorizado para WPass");
    }
    const emailHmac = keyedDigest(email, this.emailKey, "admin.email.v1");
    const rows = await this.database.client.$queryRaw<AdminAuthRow[]>`
      SELECT user_id, user_status, password_hash, hash_algorithm,
             failed_attempts, locked_until, active_tenant_ids
        FROM app.lookup_admin_auth(${emailHmac})
    `;
    const auth = rows[0];
    const tenantId = auth?.active_tenant_ids[0];
    if (!auth || !tenantId || auth.user_status !== "active") {
      throw new UnauthorizedException("Este email de Google no tiene acceso al panel");
    }
    await this.database.withTenant(tenantId, (transaction) =>
      transaction.adminCredential.update({
        where: { userId: auth.user_id },
        data: { failedAttempts: 0, lockedUntil: null },
      }),
    );
    const created = await this.createSession(
      tenantId,
      auth.user_id,
      "google_oauth",
      metadata,
      true,
    );
    return {
      ...created,
      result: { status: "authenticated", session: created.session },
      returnTo: state.returnTo,
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

  private async createSession(
    tenantId: string,
    userId: string,
    authStrength: AdminSessionView["authStrength"],
    metadata: AdminRequestMetadata,
    remember: boolean,
  ): Promise<{
    session: AdminSessionView;
    sessionToken: string;
    maxAgeSeconds?: number;
  }> {
    const now = new Date();
    const absoluteHours = remember ? this.rememberHours : this.absoluteHours;
    const expiresAt = new Date(now.getTime() + absoluteHours * 60 * 60_000);
    const idleExpiresAt = new Date(
      Math.min(expiresAt.getTime(), now.getTime() + this.idleMinutes * 60_000),
    );
    const sessionToken = generateOpaqueToken(32);
    const tokenHash = keyedDigest(sessionToken, this.sessionKey, "admin.session.v1");
    const userDataKey = deriveScopedKey(this.dataKey, userId, "admin-session-data");
    const userAgent = metadata.userAgent?.slice(0, 1_000);
    const mfaVerifiedAt = authStrength === "password" ? undefined : now;
    await this.database.withTenant(tenantId, async (transaction) => {
      await transaction.adminSession.create({
        data: {
          userId,
          tokenHash: Uint8Array.from(tokenHash),
          authStrength,
          ...(mfaVerifiedAt ? { mfaVerifiedAt } : {}),
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
          createdAt: now,
        },
      });
    });
    return {
      session: await this.buildSessionView(tenantId, userId, authStrength, expiresAt),
      sessionToken,
      ...(remember ? { maxAgeSeconds: absoluteHours * 60 * 60 } : {}),
    };
  }

  private signGoogleState(state: AdminGoogleOAuthState): string {
    const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
    const signature = keyedDigest(payload, this.sessionKey, "admin.google-oauth-state.v1").toString(
      "base64url",
    );
    return `${payload}.${signature}`;
  }

  private verifyGoogleState(value: string): AdminGoogleOAuthState {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) throw new UnauthorizedException("Estado OAuth inválido");
    const expected = keyedDigest(payload, this.sessionKey, "admin.google-oauth-state.v1").toString(
      "base64url",
    );
    if (signature !== expected) throw new UnauthorizedException("Estado OAuth inválido");
    const state = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as AdminGoogleOAuthState;
    if (
      !state.returnTo ||
      !state.returnTo.startsWith("/") ||
      state.returnTo.startsWith("//") ||
      Date.now() > state.expiresAt
    ) {
      throw new UnauthorizedException("Estado OAuth caducado");
    }
    return state;
  }

  private async exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      code,
      client_id: this.googleOAuthClientId ?? "",
      client_secret: this.googleOAuthClientSecret ?? "",
      redirect_uri: this.googleOAuthRedirectUri,
      grant_type: "authorization_code",
    });
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = (await response.json()) as GoogleTokenResponse;
    if (!response.ok) {
      throw new UnauthorizedException(payload.error_description ?? "Google OAuth ha fallado");
    }
    return payload;
  }

  private async loadGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new UnauthorizedException("No se pudo leer el perfil de Google");
    return (await response.json()) as GoogleUserInfo;
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
