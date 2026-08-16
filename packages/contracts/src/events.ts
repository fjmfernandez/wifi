import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";

export const eventEnvelopeSchema = z.object({
  id: idSchema,
  type: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/),
  version: z.number().int().positive(),
  tenantId: idSchema,
  aggregateType: z.string().min(1).max(100),
  aggregateId: idSchema,
  occurredAt: isoDateTimeSchema,
  correlationId: z.string().min(1).max(128),
  causationId: z.string().min(1).max(128).optional(),
  payload: z.record(z.string(), z.unknown()),
});
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export const radiusAccountingStatusSchema = z.enum([
  "Start",
  "Interim-Update",
  "Stop",
  "Accounting-On",
  "Accounting-Off",
]);

export const radiusAccountingEventSchema = z.object({
  tenantId: idSchema,
  gatewayId: idSchema,
  nasIdentifier: z.string().min(1).max(253),
  acctSessionId: z.string().min(1).max(253),
  status: radiusAccountingStatusSchema,
  eventAt: isoDateTimeSchema,
  sessionTimeSeconds: z.number().int().nonnegative().optional(),
  inputOctets: z.bigint().nonnegative().optional(),
  outputOctets: z.bigint().nonnegative().optional(),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});
export type RadiusAccountingEvent = z.infer<typeof radiusAccountingEventSchema>;
