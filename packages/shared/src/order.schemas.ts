import { z } from 'zod';
import { paginationQuerySchema } from './pagination.schemas';

// 订单领域的边界校验 schema（design/order.md）：前后端共用同一份，
// 金额/尺寸以字符串承载（禁浮点，技术方案 §5.1），服务层以 ZodValidationPipe 落地。

const decimal2Re = /^\d+(\.\d{1,2})?$/; // 金额：非负、最多 2 位小数
const decimal3Re = /^\d+(\.\d{1,3})?$/; // 尺寸（cm）：非负、最多 3 位小数
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const zeroRe = /^0+(\.0+)?$/;

const saleDateSchema = z
  .string()
  .regex(dateRe, '销售日期须为 YYYY-MM-DD')
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, {
    message: '销售日期不是有效日期',
  });

const positiveCm = (label: string) =>
  z
    .string()
    .regex(decimal3Re, `${label}须为非负数、最多 3 位小数`)
    .refine((value) => !zeroRe.test(value), { message: `${label}必须大于 0` });

export const saleOrderItemBoardSchema = z.object({
  productType: z.literal('board'),
  thicknessCm: positiveCm('厚度'),
  widthCm: positiveCm('宽度'),
  lengthCm: positiveCm('长度'),
  pieces: z.coerce.number().int().min(1).max(1_000_000),
  price: z.string().regex(decimal2Re, '单价须为非负数、最多 2 位小数'),
  otherAmount: z.string().regex(decimal2Re).default('0'),
  note: z.string().trim().max(200).default(''),
});
export type SaleOrderItemBoardInput = z.infer<typeof saleOrderItemBoardSchema>;

export const saleOrderItemOtherSchema = z.object({
  productType: z.literal('other'),
  lineAmount: z.string().regex(decimal2Re, '行金额须为非负数、最多 2 位小数'),
  otherAmount: z.string().regex(decimal2Re).default('0'),
  note: z.string().trim().max(200).default(''),
});
export type SaleOrderItemOtherInput = z.infer<typeof saleOrderItemOtherSchema>;

export const saleOrderItemSchema = z.discriminatedUnion('productType', [
  saleOrderItemBoardSchema,
  saleOrderItemOtherSchema,
]);
export type SaleOrderItemInput = z.infer<typeof saleOrderItemSchema>;

// 编辑明细行：形状同新建行，另带可选 id（已有行原位更新，design/order.md §2）
export const saleOrderItemUpdateSchema = z.union([
  saleOrderItemBoardSchema.extend({ id: z.string().uuid().optional() }),
  saleOrderItemOtherSchema.extend({ id: z.string().uuid().optional() }),
]);
export type SaleOrderItemUpdateInput = z.infer<typeof saleOrderItemUpdateSchema>;

const saleOrderBaseFields = {
  saleDate: saleDateSchema,
  customerId: z.string().uuid('请选择客户'),
  otherAmount: z.string().regex(decimal2Re).default('0'),
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