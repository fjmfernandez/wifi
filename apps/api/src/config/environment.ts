import { z } from "zod";

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");
const base64UrlKey = z.string().min(43).max(44);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  REDIS_URL: z
    .string()
    .url()
    .refine((value) => ["redis:", "rediss:"].includes(new URL(value).protocol)),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3002"),
  TRUST_PROXY: booleanString.default(false),
  SWAGGER_ENABLED: booleanString.default(true),
  BUILD_SHA: z.string().min(7).max(64).default("development"),
  DEMO_MODE: booleanString.default(false),
  CAPTIVE_PUBLIC_ORIGIN: z.url().default("http://localhost:3002"),
  CAPTIVE_STATE_HMAC_KEY_BASE64: base64UrlKey,
  CAPTIVE_IDENTIFIER_HMAC_KEY_BASE64: base64UrlKey,
  ADMIN_PUBLIC_ORIGIN: z.url().default("http://localhost:3000"),
  ADMIN_EMAIL_HMAC_KEY_BASE64: base64UrlKey,
  ADMIN_SESSION_HMAC_KEY_BASE64: base64UrlKey,
  DATA_ENCRYPTION_MASTER_KEY_BASE64: base64UrlKey,
  VOUCHER_HMAC_MASTER_KEY_BASE64: base64UrlKey,
  ADMIN_SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1_440).default(30),
  ADMIN_SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(168).default(8),
  ADMIN_REMEMBER_SESSION_HOURS: z.coerce.number().int().min(8).max(720).default(168),
  ADMIN_REQUIRE_MFA: booleanString.default(true),
  AUTH_RATE_LIMIT_ATTEMPTS: z.coerce.number().int().min(3).max(100).default(10),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  RADIUS_CREDENTIAL_MODE: z.enum(["blocked", "cleartext-lab-validated"]).default("blocked"),
  // El plano del agente de sede arranca deshabilitado: sin clave ni modo explícito la API
  // responde 503 en lugar de aceptar agentes sin autenticar.
  SITE_AGENT_MTLS_PROXY_MODE: z.enum(["disabled", "shared-secret"]).default("disabled"),
  SITE_AGENT_MTLS_PROXY_SHARED_SECRET_BASE64: base64UrlKey.optional(),
  SITE_AGENT_COMMAND_SIGNING_MODE: z.enum(["disabled", "ed25519"]).default("disabled"),
  SITE_AGENT_COMMAND_SIGNING_PRIVATE_KEY_BASE64: z.string().min(1).optional(),
  SITE_AGENT_ENROLLMENT_TOKEN_HMAC_KEY_BASE64: base64UrlKey.optional(),
  SITE_AGENT_CERTIFICATE_TTL_HOURS: z.coerce.number().int().min(1).max(8_760).default(720),
  SITE_AGENT_MAX_COMMANDS_PER_LEASE: z.coerce.number().int().min(1).max(100).default(10),
  SITE_AGENT_COMMAND_LEASE_SECONDS: z.coerce.number().int().min(5).max(3_600).default(300),
  SITE_AGENT_COMMAND_MAX_TTL_SECONDS: z.coerce.number().int().min(1).max(3_600).default(600),
  SITE_AGENT_EVENT_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(90).default(7),
});

export type AppEnvironment = z.infer<typeof environmentSchema> & {
  corsOrigins: string[];
};

export function parseEnvironment(input: Record<string, unknown>): AppEnvironment {
  const parsed = environmentSchema.parse(input);
  const corsOrigins = parsed.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (parsed.NODE_ENV === "production" && corsOrigins.some((origin) => origin === "*")) {
    throw new Error("CORS_ORIGINS no puede contener '*' en producción");
  }
  if (parsed.NODE_ENV === "production" && !parsed.CAPTIVE_PUBLIC_ORIGIN.startsWith("https://")) {
    throw new Error("CAPTIVE_PUBLIC_ORIGIN debe usar HTTPS en producción");
  }
  if (parsed.NODE_ENV === "production" && !parsed.ADMIN_PUBLIC_ORIGIN.startsWith("https://")) {
    throw new Error("ADMIN_PUBLIC_ORIGIN debe usar HTTPS en producción");
  }
  if (parsed.NODE_ENV === "production" && parsed.DEMO_MODE) {
    throw new Error("DEMO_MODE no puede activarse en producción");
  }

  const keys = [
    parsed.CAPTIVE_STATE_HMAC_KEY_BASE64,
    parsed.CAPTIVE_IDENTIFIER_HMAC_KEY_BASE64,
    parsed.ADMIN_EMAIL_HMAC_KEY_BASE64,
    parsed.ADMIN_SESSION_HMAC_KEY_BASE64,
    parsed.DATA_ENCRYPTION_MASTER_KEY_BASE64,
    parsed.VOUCHER_HMAC_MASTER_KEY_BASE64,
  ];
  for (const key of keys) {
    if (Buffer.from(key, "base64url").byteLength !== 32) {
      throw new Error("Las claves criptográficas deben contener exactamente 32 bytes");
    }
  }
  if (parsed.NODE_ENV === "production" && new Set(keys).size !== keys.length) {
    throw new Error("Cada finalidad criptográfica debe usar una clave distinta");
  }
  if (parsed.NODE_ENV === "production") {
    if (!new URL(parsed.DATABASE_URL).password || !new URL(parsed.REDIS_URL).password) {
      throw new Error("PostgreSQL y Redis requieren autenticación en producción");
    }
  }

  if (
    parsed.SITE_AGENT_MTLS_PROXY_MODE === "shared-secret" &&
    Buffer.from(parsed.SITE_AGENT_MTLS_PROXY_SHARED_SECRET_BASE64 ?? "", "base64url").byteLength !==
      32
  ) {
    throw new Error(
      "SITE_AGENT_MTLS_PROXY_SHARED_SECRET_BASE64 debe contener 32 bytes cuando el modo es 'shared-secret'",
    );
  }
  if (
    parsed.SITE_AGENT_COMMAND_SIGNING_MODE === "ed25519" &&
    !parsed.SITE_AGENT_COMMAND_SIGNING_PRIVATE_KEY_BASE64
  ) {
    throw new Error(
      "SITE_AGENT_COMMAND_SIGNING_PRIVATE_KEY_BASE64 es obligatoria cuando el modo de firma es 'ed25519'",
    );
  }
  if (parsed.SITE_AGENT_COMMAND_LEASE_SECONDS > parsed.SITE_AGENT_COMMAND_MAX_TTL_SECONDS) {
    throw new Error(
      "SITE_AGENT_COMMAND_LEASE_SECONDS no puede superar SITE_AGENT_COMMAND_MAX_TTL_SECONDS",
    );
  }

  return { ...parsed, corsOrigins };
}
