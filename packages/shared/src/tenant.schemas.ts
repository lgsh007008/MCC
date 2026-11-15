import { z } from 'zod';

import { paginationQuerySchema } from './pagination.schemas';
import { FEATURE_LABELS, SELLABLE_FEATURES } from './tenant.calc';

// 租户领域边界校验（design/租户.md §5）：前后端共用，服务端以 ZodValidationPipe 落地。

export const tenantCodeSchema = z
  .string()
  .trim()
  .regex(/^TN-\d{5,}$/, '租户编号格式为 TN-00001');

export const tenantStatusSchema = z.enum(['active', 'suspended']);
export const planStatusSchema = z.enum(['active', 'inactive']);
export const sellableFeatureSchema = z.enum(SELLABLE_FEATURES);

export const featureOverrideSchema = z.object({
  featureCode: sellableFeatureSchema,
  enabled: z.boolean(),
});
export type FeatureOverrideInput = z.infer<typeof featureOverrideSchema>;

export const tenantCreateSchema = z.object({
  name: z.string().trim().min(1, '请输入租户名称').max(100),
  planId: z.string().uuid('请选择套餐'),
  note: z.string().trim().max(500).default(''),
});
export type TenantCreateInput = z.infer<typeof tenantCreateSchema>;

export const tenantUpdateSchema = z.object({
  name: z.string().trim().min(1, '请输入租户名称').max(100),
  note: z.string().trim().max(500).default(''),
});
export type TenantUpdateInput = z.infer<typeof tenantUpdateSchema>;

export const tenantStatusInputSchema = z.object({ status: tenantStatusSchema });
export type TenantStatusInput = z.infer<typeof tenantStatusInputSchema>;

export const tenantPlanInputSchema = z.object({ planId: z.string().uuid('请选择套餐') });
export type TenantPlanInput = z.infer<typeof tenantPlanInputSchema>;

export const tenantFeaturesInputSchema = z.object({
  overrides: z
    .array(featureOverrideSchema)
    .max(SELLABLE_FEATURES.length)
    .refine(
      (items) => new Set(items.map((item) => item.featureCode)).size === items.length,
      '同一功能只能出现一次',
    ),
});
export type TenantFeaturesInput = z.infer<typeof tenantFeaturesInputSchema>;

export const tenantListQuerySchema = paginationQuerySchema.extend({
  code: z.string().trim().max(32).optional(),
  name: z.string().trim().max(100).optional(),
  status: tenantStatusSchema.optional(),
  planId: z.string().uuid().optional(),
});
export type TenantListQuery = z.infer<typeof tenantListQuerySchema>;

export const planCreateSchema = z.object({
  name: z.string().trim().min(1, '请输入套餐名称').max(64),
  maxAccounts: z.coerce.number().int().min(0).max(100000),
  featureCodes: z
    .array(sellableFeatureSchema)
    .max(SELLABLE_FEATURES.length)
    .default([])
    .refine(
      (items) => new Set(items).size === items.length,
      '同一功能只能出现一次',
    ),
  note: z.string().trim().max(500).default(''),
});
export type PlanCreateInput = z.infer<typeof planCreateSchema>;

export const planUpdateSchema = planCreateSchema;
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;

export const planStatusInputSchema = z.object({ status: planStatusSchema });
export type PlanStatusInput = z.infer<typeof planStatusInputSchema>;

export const featureOptions = SELLABLE_FEATURES.map((code) => ({
  value: code,
  label: FEATURE_LABELS[code],
}));
