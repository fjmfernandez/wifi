import { z } from "zod";
import { idSchema, isoDateTimeSchema, localeSchema } from "./common.js";

export const macAddressSchema = z
  .string()
  .transform((value) => value.replace(/[^0-9a-f]/gi, "").toLowerCase())
  .pipe(z.string().regex(/^[0-9a-f]{12}$/));

export const ipAddressSchema = z.union([z.ipv4(), z.ipv6()]);

export const captiveStartSchema = z.object({
  gatewayLocator: z.string().min(16).max(256),
  mac: macAddressSchema,
  ip: ipAddressSchema,
  linkLogin: z.url(),
  linkOrig: z.url().optional(),
  error: z.string().max(500).optional(),
  locale: localeSchema.default("es"),
});
export type CaptiveStart = z.infer<typeof captiveStartSchema>;

export const captiveStateSchema = z.object({
  id: idSchema,
  nonceHash: z.string().min(32),
  gatewayId: idSchema,
  tenantId: idSchema,
  siteId: idSchema,
  macHmac: z.string().min(32),
  expiresAt: isoDateTimeSchema,
  consumedAt: isoDateTimeSchema.nullable(),
});
export type CaptiveState = z.infer<typeof captiveStateSchema>;

export const loginMethodSchema = z.enum(["click", "email", "pin", "voucher"]);
export type LoginMethod = z.infer<typeof loginMethodSchema>;

export const captiveLegalVersionRefSchema = z.object({
  id: idSchema,
  locale: localeSchema,
});
export type CaptiveLegalVersionRef = z.infer<typeof captiveLegalVersionRefSchema>;

export const captiveLegalDocumentSchema = z.object({
  id: idSchema,
  siteName: z.string().min(1).max(160),
  title: z.string().min(1).max(160),
  kind: z.string().min(1).max(40),
  version: z.number().int().positive(),
  locale: localeSchema,
  content: z.string().min(1),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  publishedAt: isoDateTimeSchema,
});
export type CaptiveLegalDocument = z.infer<typeof captiveLegalDocumentSchema>;

export const captiveAuthorizeSchema = z
  .object({
    state: z.string().min(32).max(2048),
    method: loginMethodSchema,
    email: z.email().max(320).optional(),
    pin: z
      .string()
      .regex(/^[0-9A-Z-]{4,32}$/)
      .optional(),
    voucher: z
      .string()
      .regex(/^[0-9A-Z-]{6,64}$/)
      .optional(),
    acceptedLegalVersionId: idSchema,
    locale: localeSchema.default("es"),
    marketingConsent: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.method === "email" && !value.email) {
      context.addIssue({ code: "custom", path: ["email"], message: "El email es obligatorio" });
    }
    if (value.method === "pin" && !value.pin) {
      context.addIssue({ code: "custom", path: ["pin"], message: "El PIN es obligatorio" });
    }
    if (value.method === "voucher" && !value.voucher) {
      context.addIssue({ code: "custom", path: ["voucher"], message: "El voucher es obligatorio" });
    }
    if (value.marketingConsent && value.method !== "email") {
      context.addIssue({
        code: "custom",
        path: ["marketingConsent"],
        message: "El consentimiento comercial requiere un email identificable",
      });
    }
  });
export type CaptiveAuthorize = z.infer<typeof captiveAuthorizeSchema>;

export const captiveAuthorizationResultSchema = z.object({
  authorizationId: idSchema,
  username: z.string().min(16).max(128),
  password: z.string().min(24).max(256),
  loginUrl: z.url(),
  expiresAt: isoDateTimeSchema,
});
export type CaptiveAuthorizationResult = z.infer<typeof captiveAuthorizationResultSchema>;
