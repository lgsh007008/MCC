import { z } from 'zod';
import { zeroOrPositiveMoneySchema } from './finance.schemas';
import { paginationQuerySchema } from './pagination.schemas';

// 供应商领域的边界校验（design/supplier.md）：与客户域镜像。
// 名称不唯一，重名只提示不阻断；期初应付只作应付基数。

const supplierNameSchema = z.string().trim().min(1, '供应商名称必填').max(100, '供应商名称最多 100 字');
const contactSchema = z.string().trim().max(200, '联系信息最多 200 字').default('');
const noteSchema = z.string().trim().max(500, '备注最多 500 字').default('');

export const supplierInputSchema = z.object({
  name: supplierNameSchema,
  contact: contactSchema,
  // 期初应付：上线前已发生的净应付，只作应付基数；默认 0、非负、最多 2 位小数
  openingPayable: zeroOrPositiveMoneySchema.default('0.00'),
  note: noteSchema,
});
export type SupplierInput = z.infer<typeof supplierInputSchema>;

export const supplierUpdateSchema = supplierInputSchema;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;

export const supplierStatusSchema = z.enum(['active', 'inactive']);
export type SupplierStatus = z.infer<typeof supplierStatusSchema>;

export const supplierStatusInputSchema = z.object({ status: supplierStatusSchema });
export type SupplierStatusInput = z.infer<typeof supplierStatusInputSchema>;

export const supplierBatchStatusInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, '请选择供应商').max(200, '一次最多 200 个供应商'),
  status: supplierStatusSchema,
});
export type SupplierBatchStatusInput = z.infer<typeof supplierBatchStatusInputSchema>;

export const supplierBatchDeleteInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, '请选择供应商').max(200, '一次最多 200 个供应商'),
});
export type SupplierBatchDeleteInput = z.infer<typeof supplierBatchDeleteInputSchema>;

// 列表可排序列（页面模式规范：表头正/倒序）
export const supplierSortFieldSchema = z.enum(['createdAt']);
export type SupplierSortField = z.infer<typeof supplierSortFieldSchema>;

export const supplierListQuerySchema = paginationQuerySchema.extend({
  name: z.string().trim().max(100).optional(),
  status: supplierStatusSchema.optional(),
  sortBy: supplierSortFieldSchema.optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;

export const supplierNameCheckQuerySchema = z.object({
  name: supplierNameSchema,
  excludeId: z.string().uuid().optional(),
});
export type SupplierNameCheckQuery = z.infer<typeof supplierNameCheckQuerySchema>;
