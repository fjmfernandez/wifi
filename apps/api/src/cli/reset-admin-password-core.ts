import { normalizedAdminEmailSchema } from "@wifi/contracts";
import { resetAdminPassword, type AdminPasswordResetResult } from "@wifi-entelsat/database";
import { hashAdminPassword, keyedDigest } from "@wifi/security";
import { z } from "zod";

const base64UrlKey = z.string().min(43).max(44);

const resetAdminPasswordEnvironmentSchema = z
  .object({
    BOOTSTRAP_DATABASE_URL: z.string().url(),
    RESET_ADMIN_EMAIL: normalizedAdminEmailSchema,
    RESET_ADMIN_PASSWORD: z.string().min(12).max(1024),
    ADMIN_EMAIL_HMAC_KEY_BASE64: base64UrlKey,
  })
  .superRefine((environment, context) => {
    const emailKey = Buffer.from(environment.ADMIN_EMAIL_HMAC_KEY_BASE64, "base64url");
    if (emailKey.byteLength !== 32) {
      context.addIssue({
        code: "custom",
        path: ["ADMIN_EMAIL_HMAC_KEY_BASE64"],
        message: "debe contener exactamente 32 bytes",
      });
    }

    const normalizedPassword = environment.RESET_ADMIN_PASSWORD.normalize("NFKC");
    const characterClasses = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((pattern) =>
      pattern.test(normalizedPassword),
    ).length;
    if (characterClasses < 3) {
      context.addIssue({
        code: "custom",
        path: ["RESET_ADMIN_PASSWORD"],
        message: "debe combinar al menos tres clases de caracteres",
      });
    }
    const emailLocalPart = environment.RESET_ADMIN_EMAIL.split("@")[0];
    if (
      emailLocalPart &&
      emailLocalPart.length >= 4 &&
      normalizedPassword.toLowerCase().includes(emailLocalPart.toLowerCase())
    ) {
      context.addIssue({
        code: "custom",
        path: ["RESET_ADMIN_PASSWORD"],
        message: "no debe contener el identificador del correo",
      });
    }
  });

export type ResetAdminPasswordEnvironment = z.infer<typeof resetAdminPasswordEnvironmentSchema>;

export function parseResetAdminPasswordEnvironment(
  input: Record<string, unknown>,
): ResetAdminPasswordEnvironment {
  return resetAdminPasswordEnvironmentSchema.parse(input);
}

export async function runAdminPasswordReset(
  input: Record<string, unknown>,
): Promise<AdminPasswordResetResult> {
  const environment = parseResetAdminPasswordEnvironment(input);
  const emailHmacKey = Buffer.from(environment.ADMIN_EMAIL_HMAC_KEY_BASE64, "base64url");
  try {
    const emailHmac = keyedDigest(environment.RESET_ADMIN_EMAIL, emailHmacKey, "admin.email.v1");
    const passwordHash = await hashAdminPassword(environment.RESET_ADMIN_PASSWORD);
    return await resetAdminPassword(environment.BOOTSTRAP_DATABASE_URL, {
      emailHmac,
      passwordHash,
    });
  } finally {
    emailHmacKey.fill(0);
  }
}
