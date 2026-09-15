import { createHash } from "node:crypto";

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  captiveAuthorizeSchema,
  captiveGoogleOAuthStartSchema,
  captiveLegalDocumentSchema,
  captiveStartSchema,
  idSchema,
  localeSchema,
  type CaptiveAuthorizationResult,
  type CaptiveLegalDocument,
  type Locale,
} from "@wifi/contracts";
import { deriveScopedKey, generateOpaqueToken, keyedDigest } from "@wifi/security";
import { z } from "zod";

import type { AppEnvironment } from "../config/environment.js";
import {
  CAPTIVE_REPOSITORY,
  type CaptiveGatewayContext,
  type CaptiveRepository,
} from "./captive.repository.js";
import { DemoCaptiveRepository } from "./demo-captive.repository.js";

const publicCaptiveLoginMethods = new Set(["email", "voucher"]);

export interface CaptiveStartResult {
  portalUrl: string;
  expiresAt: string;
}

export interface CaptivePublicContext {
  siteName: string;
  legalVersionId: string;
  legalVersions: CaptiveGatewayContext["legalVersions"];
  availableMethods: CaptiveGatewayContext["availableMethods"];
  languages: readonly Locale[];
  googleOAuthEnabled: boolean;
  portal?: CaptiveGatewayContext["portal"];
}

export interface CaptiveGatewayPingResult {
  status: "linked";
  gatewayId: string;
  nasIdentifier: string;
  seenAt: string;
}

interface GoogleOAuthState {
  captiveState: string;
  acceptedLegalVersionId: string;
  locale: Locale;
  expiresAt: number;
}

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
}

function normalizedOrigin(value: string): string {
  const url = new URL(value);
  return url.origin.toLowerCase();
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function addMarketingConsentClause(document: CaptiveLegalDocument): CaptiveLegalDocument {
  const markerByLocale: Record<Locale, string> = {
    es: "comunicaciones comerciales",
    en: "commercial communications",
    de: "kommerzielle mitteilungen",
    fr: "communications commerciales",
    ar: "رسائل تجارية",
  };
  const marker = markerByLocale[document.locale];
  if (document.content.toLowerCase().includes(marker)) return document;

  const clauseByLocale: Record<Locale, string> = {
    es: "\n\nAl aceptar estas condiciones y acceder mediante email o Google, autorizas que el establecimiento pueda utilizar tus datos de contacto para enviarte ofertas, ventajas y comunicaciones comerciales relacionadas con sus servicios. Podrás solicitar la baja o retirada del consentimiento conforme a la política de privacidad.",
    en: "\n\nBy accepting these terms and accessing via email or Google, you authorize the venue to use your contact details to send offers, benefits and commercial communications related to its services. You may request unsubscribe or withdrawal of consent under the privacy policy.",
    de: "\n\nMit der Annahme dieser Bedingungen und dem Zugang per E-Mail oder Google stimmen Sie zu, dass der Betrieb Ihre Kontaktdaten verwenden darf, um Ihnen Angebote, Vorteile und kommerzielle Mitteilungen im Zusammenhang mit seinen Dienstleistungen zu senden. Sie können die Abmeldung oder den Widerruf Ihrer Einwilligung gemäß der Datenschutzerklärung verlangen.",
    fr: "\n\nEn acceptant ces conditions et en accédant par email ou Google, vous autorisez l’établissement à utiliser vos coordonnées pour vous envoyer des offres, avantages et communications commerciales liées à ses services. Vous pouvez demander la désinscription ou le retrait de votre consentement conformément à la politique de confidentialité.",
    ar: "\n\nبقبول هذه الشروط والدخول عبر البريد الإلكتروني أو Google، فإنك تسمح للمنشأة باستخدام بيانات الاتصال الخاصة بك لإرسال عروض ومزايا ورسائل تجارية متعلقة بخدماتها. يمكنك طلب إلغاء الاشتراك أو سحب الموافقة وفقًا لسياسة الخصوصية.",
  };
  const clause = clauseByLocale[document.locale];
  const content = `${document.content}${clause}`;
  return { ...document, content, contentHash: sha256Hex(content) };
}

@Injectable()
export class CaptiveService {
  private readonly stateKey: Buffer;
  private readonly identifierKey: Buffer;
  private readonly portalOrigin: string;
  private readonly googleOAuthEnabled: boolean;
  private readonly googleOAuthClientId?: string;
  private readonly googleOAuthClientSecret?: string;
  private readonly googleOAuthRedirectUri: string;

  constructor(
    @Inject(CAPTIVE_REPOSITORY) private readonly repository: CaptiveRepository,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.stateKey = Buffer.from(
      config.getOrThrow<string>("CAPTIVE_STATE_HMAC_KEY_BASE64"),
      "base64url",
    );
    this.identifierKey = Buffer.from(
      config.getOrThrow<string>("CAPTIVE_IDENTIFIER_HMAC_KEY_BASE64"),
      "base64url",
    );
    this.portalOrigin = config.getOrThrow<string>("CAPTIVE_PUBLIC_ORIGIN");
    this.googleOAuthEnabled = config.get("CAPTIVE_GOOGLE_LOGIN_ENABLED", { infer: true });
    this.googleOAuthClientId = config.get("GOOGLE_OAUTH_CLIENT_ID", { infer: true });
    this.googleOAuthClientSecret = config.get("GOOGLE_OAUTH_CLIENT_SECRET", { infer: true });
    this.googleOAuthRedirectUri =
      config.get("GOOGLE_OAUTH_REDIRECT_URI", { infer: true }) ??
      new URL("/api/v1/captive/oauth/google/callback", this.portalOrigin).toString();
    if (repository instanceof DemoCaptiveRepository) {
      repository.configure(
        keyedDigest("demo-gateway-locator-2026", this.identifierKey, "captive.gateway-locator.v1"),
        this.identifierKey,
      );
    }
  }

  async start(rawRequest: unknown): Promise<CaptiveStartResult> {
    const request = captiveStartSchema.parse(rawRequest);
    const locatorDigest = keyedDigest(
      request.gatewayLocator,
      this.identifierKey,
      "captive.gateway-locator.v1",
    );
    const gateway = await this.repository.resolveGateway(locatorDigest);
    if (!gateway) throw new NotFoundException("Gateway cautivo no reconocido");

    if (!gateway.allowedLoginOrigins.includes(normalizedOrigin(request.linkLogin))) {
      throw new BadRequestException("El destino de login no pertenece al gateway registrado");
    }

    const state = generateOpaqueToken(32);
    const stateDigest = keyedDigest(state, this.stateKey, "captive.state.v1");
    const tenantIdentifierKey = deriveScopedKey(
      this.identifierKey,
      gateway.tenantId,
      "captive-identifiers",
    );
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    await this.repository.createAttempt({
      stateDigest,
      nonceDigest: keyedDigest(generateOpaqueToken(32), this.stateKey, "captive.nonce.v1"),
      gateway,
      macDigest: keyedDigest(request.mac, tenantIdentifierKey, "captive.mac.v1"),
      normalizedMac: request.mac,
      ipDigest: keyedDigest(request.ip, tenantIdentifierKey, "captive.ip.v1"),
      linkLogin: request.linkLogin,
      ...(request.linkOrig ? { linkOrig: request.linkOrig } : {}),
      expiresAt,
    });
    const portalUrl = new URL("/", this.portalOrigin);
    portalUrl.searchParams.set("state", state);
    return { portalUrl: portalUrl.toString(), expiresAt: expiresAt.toISOString() };
  }

  async gatewayPing(rawRequest: unknown): Promise<CaptiveGatewayPingResult> {
    const request = z.object({ gatewayLocator: z.string().min(16).max(256) }).parse(rawRequest);
    const gateway = await this.repository.markGatewaySeen(
      keyedDigest(request.gatewayLocator, this.identifierKey, "captive.gateway-locator.v1"),
    );
    if (!gateway) throw new NotFoundException("Gateway cautivo no reconocido");
    return {
      status: "linked",
      gatewayId: gateway.gatewayId,
      nasIdentifier: gateway.nasIdentifier,
      seenAt: new Date().toISOString(),
    };
  }

  async context(rawState: unknown): Promise<CaptivePublicContext> {
    const state = z.string().min(32).max(2048).parse(rawState);
    const attempt = await this.repository.getAttempt(
      keyedDigest(state, this.stateKey, "captive.state.v1"),
    );
    if (!attempt) throw new NotFoundException("La sesión cautiva ha caducado");
    const availableMethods = attempt.gateway.availableMethods.filter((method) =>
      publicCaptiveLoginMethods.has(method),
    );
    if (availableMethods.length === 0) {
      throw new NotFoundException("No hay métodos de acceso activos para esta sede");
    }
    return {
      siteName: attempt.gateway.siteName,
      legalVersionId: attempt.gateway.legalVersionId,
      legalVersions: attempt.gateway.legalVersions,
      availableMethods,
      languages: attempt.gateway.legalVersions.map((version) => version.locale),
      googleOAuthEnabled: this.googleOAuthEnabled && availableMethods.includes("email"),
      ...(attempt.gateway.portal ? { portal: attempt.gateway.portal } : {}),
    };
  }

  async googleOAuthStart(rawRequest: unknown): Promise<string> {
    if (!this.googleOAuthEnabled || !this.googleOAuthClientId || !this.googleOAuthClientSecret) {
      throw new NotFoundException("Google Login no está configurado");
    }
    const request = captiveGoogleOAuthStartSchema.parse(rawRequest);
    const attempt = await this.repository.getAttempt(
      keyedDigest(request.state, this.stateKey, "captive.state.v1"),
    );
    if (!attempt) throw new UnauthorizedException("La sesión cautiva ha caducado");
    if (!attempt.gateway.availableMethods.includes("email")) {
      throw new BadRequestException("Google requiere que el acceso por email esté activo");
    }
    if (
      !attempt.gateway.legalVersions.some(
        (version) =>
          version.id === request.acceptedLegalVersionId && version.locale === request.locale,
      )
    ) {
      throw new BadRequestException("La versión legal aceptada no es la vigente");
    }
    const state = this.signGoogleOAuthState({
      captiveState: request.state,
      acceptedLegalVersionId: request.acceptedLegalVersionId,
      locale: request.locale,
      expiresAt: Date.now() + 5 * 60_000,
    });
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.searchParams.set("client_id", this.googleOAuthClientId);
    authorizationUrl.searchParams.set("redirect_uri", this.googleOAuthRedirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid email profile");
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("prompt", "select_account");
    return authorizationUrl.toString();
  }

  async googleOAuthCallback(rawRequest: unknown): Promise<string> {
    if (!this.googleOAuthEnabled || !this.googleOAuthClientId || !this.googleOAuthClientSecret) {
      throw new NotFoundException("Google Login no está configurado");
    }
    const query = z
      .object({
        state: z.string().min(32).max(4096),
        code: z.string().min(8).max(4096).optional(),
        error: z.string().max(256).optional(),
      })
      .parse(rawRequest);
    const state = this.verifyGoogleOAuthState(query.state);
    if (query.error || !query.code) {
      return this.renderOAuthReturnToPortal(state.captiveState, "google_cancelled");
    }

    const tokens = await this.exchangeGoogleCode(query.code);
    if (!tokens.access_token) {
      throw new UnauthorizedException("Google no ha emitido un token de acceso válido");
    }
    const userInfo = await this.loadGoogleUserInfo(tokens.access_token);
    if (!userInfo.email || userInfo.email_verified !== true) {
      throw new UnauthorizedException("Google no ha verificado el email del usuario");
    }

    const authorization = await this.authorize({
      state: state.captiveState,
      method: "email",
      firstName: userInfo.given_name ?? userInfo.name?.split(/\s+/)[0] ?? "Google",
      lastName: userInfo.family_name ?? userInfo.name?.split(/\s+/).slice(1).join(" ") ?? "User",
      email: userInfo.email,
      acceptedLegalVersionId: state.acceptedLegalVersionId,
      locale: state.locale,
      marketingConsent: true,
    });
    return this.renderMikroTikLoginForm(authorization, state.captiveState);
  }

  async legal(
    rawState: unknown,
    rawVersion: unknown,
    rawLocale: unknown,
  ): Promise<CaptiveLegalDocument> {
    const state = z.string().min(32).max(2048).parse(rawState);
    const legalVersionId = idSchema.parse(rawVersion);
    const locale = localeSchema.parse(rawLocale);
    const attempt = await this.repository.getAttempt(
      keyedDigest(state, this.stateKey, "captive.state.v1"),
    );
    if (!attempt) throw new NotFoundException("La sesión cautiva ha caducado");
    const version = attempt.gateway.legalVersions.find(
      (candidate) => candidate.id === legalVersionId && candidate.locale === locale,
    );
    if (!version) throw new NotFoundException("La versión legal no está disponible");
    const document = await this.repository.getLegalDocument(
      attempt.gateway.tenantId,
      attempt.gateway.siteName,
      version.id,
      version.locale,
    );
    if (!document) throw new NotFoundException("La versión legal no está disponible");
    return captiveLegalDocumentSchema.parse(addMarketingConsentClause(document));
  }

  async authorize(rawRequest: unknown): Promise<CaptiveAuthorizationResult> {
    const request = captiveAuthorizeSchema.parse(rawRequest);
    const stateDigest = keyedDigest(request.state, this.stateKey, "captive.state.v1");
    const attempt = await this.repository.getAttempt(stateDigest);
    if (!attempt)
      throw new UnauthorizedException("La sesión cautiva no es válida o ya fue utilizada");
    if (!publicCaptiveLoginMethods.has(request.method)) {
      throw new BadRequestException("El acceso libre no está permitido");
    }
    if (!attempt.gateway.availableMethods.includes(request.method)) {
      throw new BadRequestException("Método de acceso no disponible");
    }
    if (
      !attempt.gateway.legalVersions.some(
        (version) =>
          version.id === request.acceptedLegalVersionId && version.locale === request.locale,
      )
    ) {
      throw new BadRequestException("La versión legal aceptada no es la vigente");
    }

    const credential = {
      username: `cap_${generateOpaqueToken(24)}`,
      password: generateOpaqueToken(32),
      expiresAt: new Date(Date.now() + 15 * 60_000),
    };
    try {
      return await this.repository.issueAuthorization(stateDigest, request, credential);
    } catch (error) {
      if (error instanceof Error && error.message === "CAPTIVE_CREDENTIAL_INVALID") {
        throw new UnauthorizedException("Credencial de acceso no válida");
      }
      if (error instanceof Error && error.message === "CAPTIVE_STATE_INVALID") {
        throw new UnauthorizedException("La sesión cautiva no es válida o ya fue utilizada");
      }
      if (error instanceof Error && error.message === "CAPTIVE_LEGAL_VERSION_INVALID") {
        throw new BadRequestException("La versión legal aceptada ya no está vigente");
      }
      throw error;
    }
  }

  private signGoogleOAuthState(state: GoogleOAuthState): string {
    const payload = encodeJson(state);
    const signature = keyedDigest(payload, this.stateKey, "captive.google-oauth-state.v1").toString(
      "base64url",
    );
    return `${payload}.${signature}`;
  }

  private verifyGoogleOAuthState(value: string): GoogleOAuthState {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) throw new UnauthorizedException("Estado OAuth inválido");
    const expected = keyedDigest(payload, this.stateKey, "captive.google-oauth-state.v1").toString(
      "base64url",
    );
    if (signature !== expected) throw new UnauthorizedException("Estado OAuth inválido");
    const state = decodeJson<GoogleOAuthState>(payload);
    if (!state.captiveState || !state.acceptedLegalVersionId || Date.now() > state.expiresAt) {
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

  private renderOAuthReturnToPortal(captiveState: string, reason: string): string {
    const portalUrl = new URL("/", this.portalOrigin);
    portalUrl.searchParams.set("state", captiveState);
    portalUrl.searchParams.set("oauthError", reason);
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${escapeHtml(
      portalUrl.toString(),
    )}"></head><body><a href="${escapeHtml(portalUrl.toString())}">Volver al portal</a></body></html>`;
  }

  private renderMikroTikLoginForm(
    authorization: CaptiveAuthorizationResult,
    captiveState: string,
  ): string {
    const portalUrl = new URL("/", this.portalOrigin);
    portalUrl.searchParams.set("state", captiveState);
    return `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><title>Conectando…</title></head>
  <body>
    <form id="wpass-login" action="${escapeHtml(authorization.loginUrl)}" method="post">
      <input type="hidden" name="username" value="${escapeHtml(authorization.username)}">
      <input type="hidden" name="password" value="${escapeHtml(authorization.password)}">
      <input type="hidden" name="dst" value="https://www.entelsat.com/">
      <input type="hidden" name="popup" value="false">
      <noscript><button type="submit">Entrar en Internet</button></noscript>
    </form>
    <script>document.getElementById("wpass-login").submit();</script>
    <p>Conectando a Internet… <a href="${escapeHtml(portalUrl.toString())}">volver</a></p>
  </body>
</html>`;
  }
}
