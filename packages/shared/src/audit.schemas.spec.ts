import { describe, expect, it } from 'vitest';
import { auditLogQuerySchema } from './audit.schemas';

// 审计查询边界（product/审计日志.md R-审计-001）：分页默认值与日期/结果枚举。
describe('审计日志查询 schema', () => {
  it('默认第 1 页、每页 20 条', () => {
    expect(auditLogQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('接受日期区间、操作人与结果筛选', () => {
    const parsed = auditLogQuerySchema.parse({
      page: '2',
      pageSize: '50',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-12',
      actor: 'admin',
      domain: 'order',
      action: 'update',
      result: 'failed',
    });
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(50);
    expect(parsed.result).toBe('failed');
  });

  it('拒绝非法日期、结果与超大分页', () => {
    expect(auditLogQuerySchema.safeParse({ dateFrom: '2026/11/01' }).success).toBe(false);
    expect(auditLogQuerySchema.safeParse({ result: 'error' }).success).toBe(false);
    expect(auditLogQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});
