import { z } from 'zod';
import { dateStringSchema } from './date.schemas';
import { paginationQuerySchema } from './pagination.schemas';

// 生产与库存两张独立单据（product/生产与库存.md R-生产-001 / R-生产-005）：
// 原木领用只记吨数；方木产出按净尺寸整数毫米 + 根数，方量由服务端重算。

const positiveTonsRe = /^\d+(\.\d{1,3})?$/;
const positiveMm = (label: string, max: number) =>
  z.coerce
    .number()
    .int(`${label}须为整数毫米`)
    .min(1, `${label}必须大于 0`)
    .max(max, `${label}超出合理范围`);

// ── 原木领用 ──────────────────────────────────────────

export const materialIssueInputSchema = z.object({
  issueDate: dateStringSchema('领用日期'),
  tons: z
    .string()
    .regex(positiveTonsRe, '领用吨数须为非负数、最多 3 位小数')
    .refine((value) => !/^0+(\.0{1,3})?$/.test(value), { message: '领用吨数必须大于 0' }),
  note: z.string().trim().max(500).default(''),
  // 所属生产批次：成本对象，必须选择进行中的生产批次（R-生产-006）
  batchId: z.string().uuid('请选择生产批次'),
});
export type MaterialIssueInput = z.infer<typeof materialIssueInputSchema>;

export const materialIssueUpdateSchema = materialIssueInputSchema;
export type MaterialIssueUpdateInput = z.infer<typeof materialIssueUpdateSchema>;

export const materialIssueListQuerySchema = paginationQuerySchema.extend({
  dateFrom: dateStringSchema('领用日期起').optional(),
  dateTo: dateStringSchema('领用日期止').optional(),
  settlementStatus: z.enum(['pending', 'settled']).optional(),
  batchId: z.string().uuid().optional(),
});
export type MaterialIssueListQuery = z.infer<typeof materialIssueListQuerySchema>;

export const materialIssueBatchDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, '请选择要删除的原木领用单').max(200),
});
export type MaterialIssueBatchDeleteInput = z.infer<typeof materialIssueBatchDeleteSchema>;

// ── 方木产出 ──────────────────────────────────────────

export const productionOutputLineSchema = z.object({
  lengthMm: positiveMm('长度', 20000),
  widthMm: positiveMm('宽度', 5000),
  heightMm: positiveMm('高度', 1000),
  pieces: z.coerce.number().int().min(1).max(100_000),
  note: z.string().trim().max(200).default(''),
});
export type ProductionOutputLineInput = z.infer<typeof productionOutputLineSchema>;

export const productionOutputLineUpdateSchema = productionOutputLineSchema.extend({
  id: z.string().uuid().optional(),
});
export type ProductionOutputLineUpdateInput = z.infer<typeof productionOutputLineUpdateSchema>;

const outputBaseFields = {
  outputDate: dateStringSchema('产出日期'),
  note: z.string().trim().max(500).default(''),
  // 所属生产批次：产出把本批次待结转全额转入本批次方木池（R-生产-006）
  batchId: z.string().uuid('请选择生产批次'),
};

export const productionOutputInputSchema = z.object({
  ...outputBaseFields,
  outputs: z.array(productionOutputLineSchema).min(1, '至少一行产出').max(200),
});
export type ProductionOutputInput = z.infer<typeof productionOutputInputSchema>;

export const productionOutputUpdateSchema = z.object({
  ...outputBaseFields,
  outputs: z.array(productionOutputLineUpdateSchema).min(1, '至少一行产出').max(200),
});
export type ProductionOutputUpdateInput = z.infer<typeof productionOutputUpdateSchema>;

export const productionOutputListQuerySchema = paginationQuerySchema.extend({
  dateFrom: dateStringSchema('产出日期起').optional(),
  dateTo: dateStringSchema('产出日期止').optional(),
  batchId: z.string().uuid().optional(),
});
export type ProductionOutputListQuery = z.infer<typeof productionOutputListQuerySchema>;

export const productionOutputBatchDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, '请选择要删除的方木产出单').max(200),
});
export type ProductionOutputBatchDeleteInput = z.infer<
  typeof productionOutputBatchDeleteSchema
>;

// ── 生产批次 ──────────────────────────────────────────

export const productionBatchInputSchema = z.object({
  batchDate: dateStringSchema('批次日期'),
  note: z.string().trim().max(500).default(''),
});
export type ProductionBatchInput = z.infer<typeof productionBatchInputSchema>;

export const productionBatchUpdateSchema = productionBatchInputSchema;
export type ProductionBatchUpdateInput = z.infer<typeof productionBatchUpdateSchema>;

export const productionBatchListQuerySchema = paginationQuerySchema.extend({
  dateFrom: dateStringSchema('批次日期起').optional(),
  dateTo: dateStringSchema('批次日期止').optional(),
  status: z.enum(['open', 'closed']).optional(),
});
export type ProductionBatchListQuery = z.infer<typeof productionBatchListQuerySchema>;

export const productionBatchBatchCloseSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, '请选择要关闭的生产批次').max(200),
});
export type ProductionBatchBatchCloseInput = z.infer<typeof productionBatchBatchCloseSchema>;
