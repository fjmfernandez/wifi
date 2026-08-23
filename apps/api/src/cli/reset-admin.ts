#!/usr/bin/env node

import { randomBytes } from "node:crypto";

import { createApiDatabaseClient, withTenant } from "@wifi-entelsat/database";
import { deriveScopedKey, hashAdminPassword, keyedDigest, sealSecret } from "@wifi/security";
import { z, ZodError } from "zod";

const base64UrlKey = z.string().min(43).max(44);

const resetEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  RESET_ADMIN_EMAIL: z.email(),
  RESET_ADMIN_PASSWORD: z.string().min(12).max(1024),
  RESET_TOTP_ISSUER: z.string().trim().min(1).max(64).default("WPass"),
  RESET_TOTP_LABEL: z.string().trim().min(1).max(80).default("Autenticador principal"),
  ADMIN_EMAIL_HMAC_KEY_BASE64: base64UrlKey,
  DATA_ENCRYPTION_MASTER_KEY_BASE64: base64UrlKey,
  DATA_ENCRYPTION_KEY_VERSION: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9._:-]+$/)
    .default("env-v1"),
});

interface AdminLookupRow {
  user_id: string;
  user_status: string;
  active_tenant_ids: string[];
}

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
  if (availableBits > 0) output += alphabet[(accumulator << (5 - availableBits)) & 31];
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

function safeErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "entorno"}: ${issue.message}`)
      .join("; ");
  }
  if (error instanceof Error) return error.message;
  return "Error desconocido durante el reset";
}

async function main(): Promise<void> {
  if (!process.argv.slice(2).includes("--show-secrets-once")) {
    throw new Error(
      "Uso: RESET_ADMIN_EMAIL=... RESET_ADMIN_PASSWORD=... node apps/api/dist/cli/reset-admin.js --show-secrets-once",
    );
  }

  const environment = resetEnvironmentSchema.parse(process.env);
  const emailKey = Buffer.from(environment.ADMIN_EMAIL_HMAC_KEY_BASE64, "base64url");
  const dataKey = Buffer.from(environment.DATA_ENCRYPTION_MASTER_KEY_BASE64, "base64url");
  const emailHmac = keyedDigest(environment.RESET_ADMIN_EMAIL, emailKey, "admin.email.v1");
  const client = createApiDatabaseClient(environment.DATABASE_URL, {
    applicationName: "wpass-admin-reset",
    connectionLimit: 1,
  });

  try {
    const rows = await client.$queryRaw<AdminLookupRow[]>`
      SELECT user_id, user_status, active_tenant_ids
        FROM app.lookup_admin_auth(${emailHmac})
    `;
    const admin = rows[0];
    const tenantId = admin?.active_tenant_ids[0];
    if (!admin || !tenantId || admin.user_status !== "active") {
      throw new Error("No existe una cuenta admin activa con ese correo");
    }

    const passwordHash = await hashAdminPassword(environment.RESET_ADMIN_PASSWORD);
    const totpSecret = encodeBase32(randomBytes(20));
    const recoveryCodes = Array.from({ length: 10 }, generateRecoveryCode);
    const totpKey = deriveScopedKey(dataKey, admin.user_id, "admin-totp");
    const recoveryKey = deriveScopedKey(dataKey, admin.user_id, "admin-recovery-codes");

    try {
      await withTenant(client, tenantId, async (transaction) => {
        await transaction.adminCredential.update({
          where: { userId: admin.user_id },
          data: {
            passwordHash,
            failedAttempts: 0,
            lockedUntil: null,
            passwordChangedAt: new Date(),
            passwordExpiresAt: null,
          },
        });
        await transaction.adminSession.updateMany({
          where: { userId: admin.user_id, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: "admin_password_reset" },
        });
        await transaction.adminTotpFactor.updateMany({
          where: { userId: admin.user_id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await transaction.adminTotpFactor.create({
          data: {
            userId: admin.user_id,
            label: environment.RESET_TOTP_LABEL,
            secretCiphertext: Buffer.from(sealSecret(totpSecret, totpKey, "admin.totp.v1")),
            keyVersion: environment.DATA_ENCRYPTION_KEY_VERSION,
            recoveryCodeHashes: recoveryCodes.map((code) =>
              Buffer.from(
                keyedDigest(normalizeRecoveryCode(code), recoveryKey, "admin.recovery.v1"),
              ),
            ),
            verifiedAt: new Date(),
          },
        });
      });
    } finally {
      totpKey.fill(0);
      recoveryKey.fill(0);
    }

    process.stdout.write(
      [
        "Admin reset completado. Guarda estos valores ahora; no se volverán a mostrar.",
        `tenant_id=${tenantId}`,
        `admin_user_id=${admin.user_id}`,
        `admin_email=${environment.RESET_ADMIN_EMAIL}`,
        `totp_uri=${buildTotpUri(environment.RESET_TOTP_ISSUER, environment.RESET_ADMIN_EMAIL, totpSecret)}`,
        `totp_secret=${totpSecret}`,
        "recovery_codes:",
        ...recoveryCodes.map((code) => `  ${code}`),
        "",
      ].join("\n"),
    );
  } finally {
    dataKey.fill(0);
    emailKey.fill(0);
    await client.$disconnect();
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`Reset cancelado: ${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
} finally {
  delete process.env["RESET_ADMIN_PASSWORD"];
  delete process.env["ADMIN_EMAIL_HMAC_KEY_BASE64"];
  delete process.env["DATA_ENCRYPTION_MASTER_KEY_BASE64"];
}
