import { randomBytes } from "node:crypto";

import { normalizedAdminEmailSchema, permissionIds } from "@wifi/contracts";
import {
  bootstrapInitialAdmin,
  type InitialAdminBootstrapMaterial,
  type InitialAdminBootstrapResult,
} from "@wifi-entelsat/database";
import { deriveScopedKey, hashAdminPassword, keyedDigest, sealSecret } from "@wifi/security";
import { z } from "zod";

const base64UrlKey = z.string().min(43).max(44);
const keyVersion = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9._:-]+$/);

const bootstrapEnvironmentSchema = z
  .object({
    BOOTSTRAP_DATABASE_URL: z.string().url(),
    BOOTSTRAP_TENANT_SLUG: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/),
    BOOTSTRAP_TENANT_NAME: z.string().trim().min(1).max(160),
    BOOTSTRAP_DATA_REGION: z.string().trim().min(2).max(32).default("eu-es"),
    BOOTSTRAP_TIMEZONE: z.string().trim().min(3).max(64).default("Europe/Madrid"),
    BOOTSTRAP_ADMIN_EMAIL: normalizedAdminEmailSchema,
    BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(1024),
    BOOTSTRAP_TOTP_ISSUER: z.string().trim().min(1).max(64).default("Entelsat WiFi"),
    BOOTSTRAP_TOTP_LABEL: z.string().trim().min(1).max(80).default("Autenticador principal"),
    ADMIN_EMAIL_HMAC_KEY_BASE64: base64UrlKey,
    DATA_ENCRYPTION_MASTER_KEY_BASE64: base64UrlKey,
    DATA_ENCRYPTION_KEY_VERSION: keyVersion,
  })
  .superRefine((environment, context) => {
    const emailKey = Buffer.from(environment.ADMIN_EMAIL_HMAC_KEY_BASE64, "base64url");
    const dataKey = Buffer.from(environment.DATA_ENCRYPTION_MASTER_KEY_BASE64, "base64url");
    if (emailKey.byteLength !== 32) {
      context.addIssue({
        code: "custom",
        path: ["ADMIN_EMAIL_HMAC_KEY_BASE64"],
        message: "debe contener exactamente 32 bytes",
      });
    }
    if (dataKey.byteLength !== 32) {
      context.addIssue({
        code: "custom",
        path: ["DATA_ENCRYPTION_MASTER_KEY_BASE64"],
        message: "debe contener exactamente 32 bytes",
      });
    }
    if (emailKey.byteLength === 32 && dataKey.byteLength === 32 && emailKey.equals(dataKey)) {
      context.addIssue({
        code: "custom",
        path: ["DATA_ENCRYPTION_MASTER_KEY_BASE64"],
        message: "debe ser distinta de la clave HMAC de correo",
      });
    }
    const normalizedPassword = environment.BOOTSTRAP_ADMIN_PASSWORD.normalize("NFKC");
    const characterClasses = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((pattern) =>
      pattern.test(normalizedPassword),
    ).length;
    if (characterClasses < 3) {
      context.addIssue({
        code: "custom",
        path: ["BOOTSTRAP_ADMIN_PASSWORD"],
        message: "debe combinar al menos tres clases de caracteres",
      });
    }
    const emailLocalPart = environment.BOOTSTRAP_ADMIN_EMAIL.split("@")[0];
    if (
      emailLocalPart &&
      emailLocalPart.length >= 4 &&
      normalizedPassword.toLowerCase().includes(emailLocalPart.toLowerCase())
    ) {
      context.addIssue({
        code: "custom",
        path: ["BOOTSTRAP_ADMIN_PASSWORD"],
        message: "no debe contener el identificador del correo",
      });
    }
  });

export type AdminBootstrapEnvironment = z.infer<typeof bootstrapEnvironmentSchema>;

export interface AdminBootstrapOneTimeOutput {
  totpSecret: string;
  totpUri: string;
  recoveryCodes: string[];
}

const permissionDescriptions = permissionIds.map(
  (permission) => `Permiso operativo Entelsat WiFi: ${permission}`,
);

function encodeBase32(value: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let accumulator = 0;
  let availableBits = 0;
  let output = "";
  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    availableBits += 8;
    while (availableBits >= 5) {
      availableBits -= 5;
      output += alphabet[(accumulator >>> availableBits) & 31];
    }
  }
  if (availableBits > 0) {
    output += alphabet[(accumulator << (5 - availableBits)) & 31];
  }
  return output;
}

function generateRecoveryCode(): string {
  const encoded = encodeBase32(randomBytes(10));
  return encoded.match(/.{1,4}/g)?.join("-") ?? encoded;
}

function normalizeRecoveryCode(value: string): string {
  return value.replaceAll("-", "").toUpperCase();
}

function buildTotpUri(issuer: string, email: string, secret: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

export function parseAdminBootstrapEnvironment(
  input: Record<string, unknown>,
): AdminBootstrapEnvironment {
  return bootstrapEnvironmentSchema.parse(input);
}

export async function createAdminBootstrapMaterial(
  environment: AdminBootstrapEnvironment,
  userId: string,
): Promise<InitialAdminBootstrapMaterial<AdminBootstrapOneTimeOutput>> {
  const dataKey = Buffer.from(environment.DATA_ENCRYPTION_MASTER_KEY_BASE64, "base64url");
  const emailEncryptionKey = deriveScopedKey(dataKey, userId, "admin-email");
  const totpEncryptionKey = deriveScopedKey(dataKey, userId, "admin-totp");
  const recoveryHmacKey = deriveScopedKey(dataKey, userId, "admin-recovery-codes");
  const totpSecret = encodeBase32(randomBytes(20));
  const recoveryCodes = Array.from({ length: 10 }, generateRecoveryCode);

  try {
    return {
      emailCiphertext: sealSecret(
        environment.BOOTSTRAP_ADMIN_EMAIL,
        emailEncryptionKey,
        "admin.email.v1",
      ),
      emailKeyVersion: environment.DATA_ENCRYPTION_KEY_VERSION,
      passwordHash: await hashAdminPassword(environment.BOOTSTRAP_ADMIN_PASSWORD),
      totpLabel: environment.BOOTSTRAP_TOTP_LABEL,
      totpSecretCiphertext: sealSecret(totpSecret, totpEncryptionKey, "admin.totp.v1"),
      totpKeyVersion: environment.DATA_ENCRYPTION_KEY_VERSION,
      recoveryCodeHashes: recoveryCodes.map((code) =>
        keyedDigest(normalizeRecoveryCode(code), recoveryHmacKey, "admin.recovery.v1"),
      ),
      oneTimeOutput: {
        totpSecret,
        totpUri: buildTotpUri(
          environment.BOOTSTRAP_TOTP_ISSUER,
          environment.BOOTSTRAP_ADMIN_EMAIL,
          totpSecret,
        ),
        recoveryCodes,
      },
    };
  } finally {
    dataKey.fill(0);
    emailEncryptionKey.fill(0);
    totpEncryptionKey.fill(0);
    recoveryHmacKey.fill(0);
  }
}

export async function runInitialAdminBootstrap(
  input: Record<string, unknown>,
): Promise<InitialAdminBootstrapResult<AdminBootstrapOneTimeOutput>> {
  const environment = parseAdminBootstrapEnvironment(input);
  const emailHmacKey = Buffer.from(environment.ADMIN_EMAIL_HMAC_KEY_BASE64, "base64url");
  try {
    const emailHmac = keyedDigest(
      environment.BOOTSTRAP_ADMIN_EMAIL,
      emailHmacKey,
      "admin.email.v1",
    );
    return await bootstrapInitialAdmin(
      environment.BOOTSTRAP_DATABASE_URL,
      {
        tenantSlug: environment.BOOTSTRAP_TENANT_SLUG,
        tenantName: environment.BOOTSTRAP_TENANT_NAME,
        dataRegion: environment.BOOTSTRAP_DATA_REGION,
        defaultTimezone: environment.BOOTSTRAP_TIMEZONE,
        emailHmac,
        permissionCodes: permissionIds,
        permissionDescriptions,
      },
      (userId) => createAdminBootstrapMaterial(environment, userId),
    );
  } finally {
    emailHmacKey.fill(0);
  }
}
