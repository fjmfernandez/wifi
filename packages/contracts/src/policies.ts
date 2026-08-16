import { z } from "zod";
import { idSchema } from "./common.js";

const nonNegativeInt = z.number().int().nonnegative();

export const bandwidthLimitSchema = z.object({
  uploadKbps: z.number().int().positive().max(10_000_000),
  downloadKbps: z.number().int().positive().max(10_000_000),
  burstUploadKbps: z.number().int().positive().max(10_000_000).optional(),
  burstDownloadKbps: z.number().int().positive().max(10_000_000).optional(),
});

export const accessPolicyInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sessionTimeoutSeconds: z.number().int().min(60).max(31_536_000).optional(),
  idleTimeoutSeconds: z.number().int().min(30).max(86_400).optional(),
  interimIntervalSeconds: z.number().int().min(60).max(3_600).default(300),
  portLimit: z.number().int().min(1).max(100).default(1),
  uploadBytesLimit: nonNegativeInt.optional(),
  downloadBytesLimit: nonNegativeInt.optional(),
  totalBytesLimit: nonNegativeInt.optional(),
  bandwidth: bandwidthLimitSchema.optional(),
});
export type AccessPolicyInput = z.infer<typeof accessPolicyInputSchema>;

export const radiusReplyAttributesSchema = z.object({
  authorizationId: idSchema,
  sessionTimeout: z.number().int().positive().optional(),
  idleTimeout: z.number().int().positive().optional(),
  acctInterimInterval: z.number().int().positive(),
  portLimit: z.number().int().positive(),
  mikrotikRateLimit: z.string().min(3).optional(),
  mikrotikRecvLimit: nonNegativeInt.optional(),
  mikrotikXmitLimit: nonNegativeInt.optional(),
  mikrotikTotalLimit: nonNegativeInt.optional(),
});
export type RadiusReplyAttributes = z.infer<typeof radiusReplyAttributesSchema>;
