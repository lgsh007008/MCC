import { z } from 'zod';
import { paginationQuerySchema } from './pagination.schemas';

// 财务领域的边界校验 schema（design/finance.md）：前后端共用同一份，
// 金额以字符串承载（禁浮点，技术方案 §5.1），服务层以 ZodValidationPipe 落地。

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const positiveMoneyRe = /^\d+(\.\d{1,2})?$/; // 正数、最多 2 位小数（手工金额按正数提交）

const occurredDateSchema = z
  .string()
  .regex(dateRe, '发生日期须为 YYYY-MM-DD')
  .refine(
    (value) =>
      !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) &&
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
    { message: '发生日期不是有效日期' },
  );

const positiveMoneySchema = z
  .string()
  .regex(positiveMoneyRe, '金额须为正数、最多 2 位小数')
  .refine((value) => !/^0+(\.0{1,2})?$/.test(value), { message: '金额必须大于 0' });

export const financeCategorySchema = z.enum([
  'sales_revenue',
  'other_revenue',
  'purchase_cost',
  'labor_cost',
  'other_expense',
]);
export type FinanceCategoryValue = z.infer<typeof financeCategorySchema>;

// 手工记账仅允许「其他收入 / 其他支出」（系统类分类由业务单据自动生成）
export const manualFinanceCategorySchema = z.enum(['other_revenue', 'other_expense']);

export const financeEventInputSchema = z.object({
  category: manualFinanceCategorySchema,
  occurredDate: occurredDateSchema,
  amount: positiveMoneySchema,
  note: z.string().trim().max(200).default(''),
});
export type FinanceEventInput = z.infer<typeof financeEventInputSchema>;

export const financeEventUpdateSchema = financeEventInputSchema;
export type FinanceEventUpdateInput = z.infer<typeof financeEventUpdateSchema>;

// 列表可排序列（页面模式规范：表头正/倒序）
export const financeEventSortFieldSchema = z.enum(['occurredDate', 'amount']);
export type FinanceEventSortField = z.infer<typeof financeEventSortFieldSchema>;

export const financeEventListQuerySchema = paginationQuerySchema.extend({
  dateFrom: occurredDateSchema.optional(),
  dateTo: occurredDateSchema.optional(),
  category: financeCategorySchema.optional(),
  source: z.enum(['auto', 'manual']).optional(),
  sortBy: financeEventSortFieldSchema.optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
export type FinanceEventListQuery = z.infer<typeof financeEventListQuerySchema>;

export const financeSummaryQuerySchema = z.object({
  dateFrom: occurredDateSchema.optional(),
  dateTo: occurredDateSchema.optional(),
});
export type FinanceSummaryQuery = z.infer<typeof financeSummaryQuerySchema>;

export const financeEventBatchDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, '请选择要删除的事件').max(200),
});
export type FinanceEventBatchDeleteInput = z.infer<typeof financeEventBatchDeleteSchema>;
