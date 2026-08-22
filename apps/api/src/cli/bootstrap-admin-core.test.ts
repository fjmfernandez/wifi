import {
  deriveScopedKey,
  openSecretText,
  totpCode,
  verifyAdminPassword,
  verifyTotp,
} from "@wifi/security";
import { describe, expect, test } from "vitest";

import {
  createAdminBootstrapMaterial,
  parseAdminBootstrapEnvironment,
} from "./bootstrap-admin-core.js";

const userId = "0198a000-0000-7000-8000-00000000a001";
const emailHmacKey = Buffer.alloc(32, 11).toString("base64url");
const dataKey = Buffer.alloc(32, 22).toString("base64url");

function validEnvironment(): Record<string, string> {
  return {
    BOOTSTRAP_DATABASE_URL:
      "postgresql://wifi_bootstrap:deployment-secret@postgres:5432/wifi_entelsat",
    BOOTSTRAP_TENANT_SLUG: "entelsat-hoteles",
    BOOTSTRAP_TENANT_NAME: "Entelsat Hoteles",
    BOOTSTRAP_ADMIN_EMAIL: "  ADMIN@Example.COM ",
    BOOTSTRAP_ADMIN_PASSWORD: "Correct-Horse-2026-Battery!",
    ADMIN_EMAIL_HMAC_KEY_BASE64: emailHmacKey,
    DATA_ENCRYPTION_MASTER_KEY_BASE64: dataKey,
    DATA_ENCRYPTION_KEY_VERSION: "env-v1",
  };
}

describe("initial admin bootstrap material", () => {
  test("normalizes identity and rejects key reuse or a weak initial password", () => {
    expect(parseAdminBootstrapEnvironment(validEnvironment())).toMatchObject({
      BOOTSTRAP_ADMIN_EMAIL: "admin@example.com",
      BOOTSTRAP_DATA_REGION: "eu-es",
      BOOTSTRAP_TIMEZONE: "Europe/Madrid",
    });

    expect(
      parseAdminBootstrapEnvironment({
        ...validEnvironment(),
        BOOTSTRAP_ADMIN_EMAIL: "entelsat@entelsat.com",
        BOOTSTRAP_ADMIN_PASSWORD: "Claudia:2012",
      }),
    ).toMatchObject({
      BOOTSTRAP_ADMIN_EMAIL: "entelsat@entelsat.com",
      BOOTSTRAP_ADMIN_PASSWORD: "Claudia:2012",
    });

    expect(() =>
      parseAdminBootstrapEnvironment({
        ...validEnvironment(),
        DATA_ENCRYPTION_MASTER_KEY_BASE64: emailHmacKey,
        BOOTSTRAP_ADMIN_PASSWORD: "onlylowercasepassword",
      }),
    ).toThrow();
  });

  test("produces scrypt, decryptable TOTP/email, and only hashed recovery material", async () => {
    const environment = parseAdminBootstrapEnvironment(validEnvironment());
    const material = await createAdminBootstrapMaterial(environment, userId);
    const masterKey = Buffer.from(dataKey, "base64url");
    const emailKey = deriveScopedKey(masterKey, userId, "admin-email");
    const totpKey = deriveScopedKey(masterKey, userId, "admin-totp");

    expect(openSecretText(Buffer.from(material.emailCiphertext), emailKey, "admin.email.v1")).toBe(
      "admin@example.com",
    );
    expect(
      openSecretText(Buffer.from(material.totpSecretCiphertext), totpKey, "admin.totp.v1"),
    ).toBe(material.oneTimeOutput.totpSecret);
    expect(
      await verifyAdminPassword(environment.BOOTSTRAP_ADMIN_PASSWORD, material.passwordHash),
    ).toBe(true);

    const code = totpCode(material.oneTimeOutput.totpSecret, 1_800_000_000_000);
    expect(verifyTotp(code, material.oneTimeOutput.totpSecret, 1_800_000_000_000, 0)).toBe(true);
    expect(material.oneTimeOutput.totpUri).toContain("otpauth://totp/Entelsat%20WiFi:");
    expect(material.oneTimeOutput.totpUri).toContain(`secret=${material.oneTimeOutput.totpSecret}`);

    expect(material.oneTimeOutput.recoveryCodes).toHaveLength(10);
    expect(new Set(material.oneTimeOutput.recoveryCodes).size).toBe(10);
    expect(material.recoveryCodeHashes).toHaveLength(10);
    expect(material.recoveryCodeHashes.every((hash) => hash.byteLength === 32)).toBe(true);
    for (const codeValue of material.oneTimeOutput.recoveryCodes) {
      expect(
        Buffer.concat(material.recoveryCodeHashes.map((hash) => Buffer.from(hash))).includes(
          codeValue,
        ),
      ).toBe(false);
    }

    masterKey.fill(0);
    emailKey.fill(0);
    totpKey.fill(0);
  });
});
