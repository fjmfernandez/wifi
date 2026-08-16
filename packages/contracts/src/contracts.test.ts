import { describe, expect, it } from "vitest";
import {
  adminLoginSchema,
  captiveAuthorizeSchema,
  macAddressSchema,
  permissionIdSchema,
  scopedResourceSchema,
} from "./index.js";

describe("contratos compartidos", () => {
  it("normaliza el email admin y exige una contraseña fuerte", () => {
    expect(
      adminLoginSchema.parse({
        email: "  ADMIN@Example.COM ",
        password: "correct horse battery staple",
      }),
    ).toMatchObject({ email: "admin@example.com", remember: false });
    expect(
      adminLoginSchema.safeParse({ email: "admin@example.com", password: "short" }).success,
    ).toBe(false);
  });

  it("normaliza direcciones MAC", () => {
    expect(macAddressSchema.parse("AA:BB:CC:DD:EE:FF")).toBe("aabbccddeeff");
  });

  it("rechaza métodos captive sin su credencial", () => {
    const parsed = captiveAuthorizeSchema.safeParse({
      state: "s".repeat(32),
      method: "voucher",
      acceptedLegalVersionId: "018f47a5-9b2a-7ab0-91d4-28f3734a3dd9",
    });
    expect(parsed.success).toBe(false);
  });

  it("exige un único alcance coherente", () => {
    const parsed = scopedResourceSchema.safeParse({
      tenantId: "018f47a5-9b2a-7ab0-91d4-28f3734a3dd9",
      scopeType: "site",
    });
    expect(parsed.success).toBe(false);
  });

  it("mantiene el catálogo de permisos cerrado", () => {
    expect(permissionIdSchema.safeParse("gateway.config.deploy").success).toBe(true);
    expect(permissionIdSchema.safeParse("gateway.*").success).toBe(false);
  });
});
