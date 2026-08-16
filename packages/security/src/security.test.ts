import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { hashAdminPassword, verifyAdminPassword } from "./password.js";
import { deriveScopedKey, openSecretText, sealSecret } from "./secretbox.js";
import { generateOpaqueToken, keyedDigest, safeReturnPath } from "./tokens.js";
import { totpCode, verifyTotp } from "./totp.js";
import { generateVoucherCode, normalizeVoucherCode, voucherLookupDigest } from "./vouchers.js";

describe("security primitives", () => {
  it("hashes and verifies an admin password", async () => {
    const encoded = await hashAdminPassword("correct horse battery staple", {
      logN: 12,
      r: 8,
      p: 1,
      keyLength: 32,
    });
    await expect(verifyAdminPassword("correct horse battery staple", encoded)).resolves.toBe(true);
    await expect(verifyAdminPassword("wrong password value", encoded)).resolves.toBe(false);
  });

  it("uses contextual tenant-keyed voucher lookup digests", () => {
    const key = randomBytes(32);
    const code = generateVoucherCode("MIR");
    expect(code).toMatch(/^MIR-(?:[A-HJ-NP-Z2-9]{4}-){2}[A-HJ-NP-Z2-9]{4}$/);
    expect(voucherLookupDigest(code, key)).toEqual(
      voucherLookupDigest(normalizeVoucherCode(code), key),
    );
    expect(voucherLookupDigest(code, key)).not.toEqual(keyedDigest(code, key, "another.context"));
  });

  it("rejects open redirect forms", () => {
    expect(safeReturnPath("/sedes?estado=online")).toBe("/sedes?estado=online");
    expect(safeReturnPath("//attacker.example/path")).toBe("/administracion");
    expect(safeReturnPath("https://attacker.example")).toBe("/administracion");
  });

  it("implements the RFC 6238 SHA-1 test vector", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(totpCode(secret, 59_000, 30, 8)).toBe("94287082");
    const current = totpCode(secret, 1_234_567_890_000, 30, 6);
    expect(verifyTotp(current, secret, 1_234_567_890_000)).toBe(true);
  });

  it("generates opaque tokens with at least 256 bits by default", () => {
    expect(Buffer.from(generateOpaqueToken(), "base64url")).toHaveLength(32);
  });

  it("encrypts scoped secrets and rejects tampering or the wrong context", () => {
    const master = randomBytes(32);
    const key = deriveScopedKey(master, "tenant-018f", "identity");
    const sealed = sealSecret("persona@example.com", key, "identity.email.v1");
    expect(openSecretText(sealed, key, "identity.email.v1")).toBe("persona@example.com");
    expect(() => openSecretText(sealed, key, "identity.totp.v1")).toThrow();

    const tampered = Buffer.from(sealed);
    const lastIndex = tampered.length - 1;
    tampered.writeUInt8(tampered.readUInt8(lastIndex) ^ 1, lastIndex);
    expect(() => openSecretText(tampered, key, "identity.email.v1")).toThrow();
  });
});
