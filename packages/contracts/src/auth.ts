import { z } from "zod";

import { idSchema, isoDateTimeSchema } from "./common.js";

export const normalizedAdminEmailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((value) => value.trim().normalize("NFKC").toLowerCase());

export const adminLoginSchema = z.object({
  email: normalizedAdminEmailSchema,
  password: z.string().min(12).max(1024),
  totp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  remember: z.boolean().default(false),
});
export type AdminLogin = z.infer<typeof adminLoginSchema>;

export const adminSessionViewSchema = z.object({
  userId: idSchema,
  tenantId: idSchema,
  tenantName: z.string().min(1).max(160),
  membershipId: idSchema,
  authStrength: z.enum(["password", "totp", "webauthn", "recovery_code"]),
  permissions: z.array(z.string().min(1).max(120)),
  expiresAt: isoDateTimeSchema,
});
export type AdminSessionView = z.infer<typeof adminSessionViewSchema>;

export const adminLoginResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("mfa_required") }),
  z.object({ status: z.literal("authenticated"), session: adminSessionViewSchema }),
]);
export type AdminLoginResult = z.infer<typeof adminLoginResultSchema>;
