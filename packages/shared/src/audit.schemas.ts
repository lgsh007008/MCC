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

// 平台运营审计查询（design/审计日志.md §9）：全局表、跨租户，
// 用 targetTenant 同时匹配目标租户编号与名称。
export const platformAuditLogQuerySchema = paginationQuerySchema.extend({
  dateFrom: dateSchema,
  dateTo: dateSchema,
  actor: z.string().trim().max(100).optional(),
  action: z.string().trim().max(100).optional(),
  targetTenant: z.string().trim().max(100).optional(),
  result: auditResultSchema.optional(),
});
export type PlatformAuditLogQuery = z.infer<typeof platformAuditLogQuerySchema>;
