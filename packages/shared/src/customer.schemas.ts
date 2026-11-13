import { z } from 'zod';
import { zeroOrPositiveMoneySchema } from './finance.schemas';
import { paginationQuerySchema } from './pagination.schemas';

// 客户领域的边界校验（design/customer.md）：前后端共用同一份。
// 客户名称不做唯一约束（product/customer.md R-客户-001：只做重名提示，不阻断保存）。

const customerNameSchema = z.string().trim().min(1, '客户名称必填').max(100, '客户名称最多 100 字');
const contactSchema = z.string().trim().max(200, '联系信息最多 200 字').default('');
const noteSchema = z.string().trim().max(500, '备注最多 500 字').default('');

export const customerInputSchema = z.object({
  name: customerNameSchema,
  contact: contactSchema,
  // 期初欠款：上线前已发生的净欠款，只作欠款基数；默认 0、非负、最多 2 位小数
  openingDebt: zeroOrPositiveMoneySchema.default('0.00'),
  note: noteSchema,
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

export const customerUpdateSchema = customerInputSchema;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export const customerStatusSchema = z.enum(['active', 'inactive']);
export type CustomerStatus = z.infer<typeof customerStatusSchema>;

export const customerStatusInputSchema = z.object({ status: customerStatusSchema });
export type CustomerStatusInput = z.infer<typeof customerStatusInputSchema>;

// 批量启用 / 停用（product/customer.md 列表页批量操作）：只更新与目标状态不同的未删行，
// 已处于目标状态或不存在 / 已删的静默跳过。
export const customerBatchStatusInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, '请选择客户').max(200, '一次最多 200 个客户'),
  status: customerStatusSchema,
});
export type CustomerBatchStatusInput = z.infer<typeof customerBatchStatusInputSchema>;

// 批量删除（软删除；不存在 / 已删的静默跳过）
export const customerBatchDeleteInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, '请选择客户').max(200, '一次最多 200 个客户'),
});
export type CustomerBatchDeleteInput = z.infer<typeof customerBatchDeleteInputSchema>;

export const customerListQuerySchema = paginationQuerySchema.extend({
  name: z.string().trim().max(100).optional(),
  status: customerStatusSchema.optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export const customerNameCheckQuerySchema = z.object({
  name: customerNameSchema,
  excludeId: z.string().uuid().optional(),
});
export type CustomerNameCheckQuery = z.infer<typeof customerNameCheckQuerySchema>;
