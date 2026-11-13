import { z } from 'zod';
import { paginationQuerySchema } from './pagination.schemas';

// 审计日志查询边界（product/审计日志.md R-审计-001）：
// 前后端共用同一份；时间按 YYYY-MM-DD 传入，服务端按自然日闭区间处理。

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式为 YYYY-MM-DD')
  .optional();

export const auditResultSchema = z.enum(['ok', 'failed']);
export type AuditResult = z.infer<typeof auditResultSchema>;

export const auditLogQuerySchema = paginationQuerySchema.extend({
  dateFrom: dateSchema,
  dateTo: dateSchema,
  actor: z.string().trim().max(100).optional(),
  domain: z.string().trim().max(50).optional(),
  action: z.string().trim().max(100).optional(),
  result: auditResultSchema.optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
