import { z } from 'zod';
import { paginationQuerySchema } from './pagination.schemas';

// 订单领域的边界校验 schema（design/order.md）：前后端共用同一份，
// 金额/尺寸以字符串承载（禁浮点，技术方案 §5.1），服务层以 ZodValidationPipe 落地。

const decimal2Re = /^\d+(\.\d{1,2})?$/; // 金额：非负、最多 2 位小数
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const saleDateSchema = z
  .string()
  .regex(dateRe, '销售日期须为 YYYY-MM-DD')
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, {
    message: '销售日期不是有效日期',
  });

// 尺寸：整数毫米（product/order.md R-订单-001）
const positiveMm = (label: string, max: number) =>
  z.coerce
    .number()
    .int(`${label}须为整数毫米`)
    .min(1, `${label}必须大于 0`)
    .max(max, `${label}超出合理范围`);

export const saleOrderItemSchema = z.object({
  lengthMm: positiveMm('长度', 20000),
  widthMm: positiveMm('宽度', 5000),
  heightMm: positiveMm('高度', 1000),
  pieces: z.coerce.number().int().min(1).max(100_000),
  pricingMode: z.enum(['volume', 'piece']).default('volume'),
  price: z.string().regex(decimal2Re, '单价须为非负数、最多 2 位小数'),
  otherAmount: z.string().regex(decimal2Re, '其他金额须为非负数、最多 2 位小数').default('0'),
  note: z.string().trim().max(200).default(''),
});
export type SaleOrderItemInput = z.infer<typeof saleOrderItemSchema>;

// 编辑明细行：形状同新建行，另带可选 id（已有行原位更新，design/order.md §2）
export const saleOrderItemUpdateSchema = saleOrderItemSchema.extend({
  id: z.string().uuid().optional(),
});
export type SaleOrderItemUpdateInput = z.infer<typeof saleOrderItemUpdateSchema>;

const saleOrderBaseFields = {
  saleDate: saleDateSchema,
  customerId: z.string().uuid('请选择客户'),
  otherAmount: z.string().regex(decimal2Re, '其他金额须为非负数、最多 2 位小数').default('0'),
  note: z.string().trim().max(500).default(''),
};

export const saleOrderInputSchema = z.object({
  ...saleOrderBaseFields,
  items: z.array(saleOrderItemSchema).min(1, '至少一行明细').max(200),
});
export type SaleOrderInput = z.infer<typeof saleOrderInputSchema>;

export const saleOrderUpdateSchema = z.object({
  ...saleOrderBaseFields,
  items: z.array(saleOrderItemUpdateSchema).min(1, '至少一行明细').max(200),
});
export type SaleOrderUpdateInput = z.infer<typeof saleOrderUpdateSchema>;

// 列表可排序列（页面模式规范：表头正/倒序）
export const saleOrderSortFieldSchema = z.enum(['saleDate', 'totalVolume', 'totalAmount']);
export type SaleOrderSortField = z.infer<typeof saleOrderSortFieldSchema>;

export const saleOrderListQuerySchema = paginationQuerySchema.extend({
  customerId: z.string().uuid().optional(),
  // 移动端按客户名称模糊搜索（查的是单据里的名称快照）
  customerName: z.string().trim().max(100).optional(),
  dateFrom: saleDateSchema.optional(),
  dateTo: saleDateSchema.optional(),
  sortBy: saleOrderSortFieldSchema.optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
export type SaleOrderListQuery = z.infer<typeof saleOrderListQuerySchema>;

// 客户维度累计方量汇总（product/customer.md 只引用不重述）：
// customerIds 为逗号分隔的客户 id，1~200 个。
export const customerVolumeSummaryQuerySchema = z.object({
  customerIds: z
    .string()
    .trim()
    .min(1, '请提供客户 id')
    .transform((value) => value.split(',').map((id) => id.trim()).filter(Boolean))
    .refine((ids) => ids.length >= 1 && ids.length <= 200, { message: '客户 id 数量须为 1~200' })
    .refine((ids) => ids.every((id) => z.string().uuid().safeParse(id).success), {
      message: '客户 id 格式不合法',
    }),
});
export type CustomerVolumeSummaryQuery = z.infer<typeof customerVolumeSummaryQuerySchema>;

// 批量删除（页面模式规范：列表多选 + 批量操作）
export const saleOrderBatchDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, '请选择要删除的销售单').max(200),
});
export type SaleOrderBatchDeleteInput = z.infer<typeof saleOrderBatchDeleteSchema>;