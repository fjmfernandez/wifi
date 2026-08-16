import { z } from "zod";

export const idSchema = z.string().uuid();
export type Id = z.infer<typeof idSchema>;

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const localeSchema = z.enum(["es", "en"]);
export type Locale = z.infer<typeof localeSchema>;

export const environmentSchema = z.enum(["development", "test", "staging", "production"]);
export type Environment = z.infer<typeof environmentSchema>;

export const scopeTypeSchema = z.enum(["tenant", "organization", "site_group", "site"]);
export type ScopeType = z.infer<typeof scopeTypeSchema>;

export const scopedResourceSchema = z
  .object({
    tenantId: idSchema,
    scopeType: scopeTypeSchema,
    organizationId: idSchema.optional(),
    siteGroupId: idSchema.optional(),
    siteId: idSchema.optional(),
  })
  .superRefine((value, context) => {
    const selected = [value.organizationId, value.siteGroupId, value.siteId].filter(Boolean);
    const expected = value.scopeType === "tenant" ? 0 : 1;

    if (selected.length !== expected) {
      context.addIssue({
        code: "custom",
        message: "El alcance debe identificar exactamente el recurso declarado",
      });
    }

    if (value.scopeType === "organization" && !value.organizationId) {
      context.addIssue({ code: "custom", message: "organizationId es obligatorio" });
    }
    if (value.scopeType === "site_group" && !value.siteGroupId) {
      context.addIssue({ code: "custom", message: "siteGroupId es obligatorio" });
    }
    if (value.scopeType === "site" && !value.siteId) {
      context.addIssue({ code: "custom", message: "siteId es obligatorio" });
    }
  });
export type ScopedResource = z.infer<typeof scopedResourceSchema>;

export const paginationInputSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationInput = z.infer<typeof paginationInputSchema>;

export const problemDetailsSchema = z.object({
  type: z.string().default("about:blank"),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  correlationId: z.string().min(1),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const pageSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });
