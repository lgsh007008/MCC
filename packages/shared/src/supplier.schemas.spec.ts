import { describe, expect, it } from 'vitest';
import { supplierListQuerySchema } from './supplier.schemas';

// 供应商列表查询（design/supplier.md §5）：排序只开放创建日期，方向 asc / desc。

describe('供应商列表查询', () => {
  it('不传排序参数时均为 undefined', () => {
    const parsed = supplierListQuerySchema.parse({ page: 1, pageSize: 20 });
    expect(parsed.sortBy).toBeUndefined();
    expect(parsed.sortOrder).toBeUndefined();
  });

  it('sortBy 只接受 createdAt', () => {
    expect(
      supplierListQuerySchema.parse({ page: 1, pageSize: 20, sortBy: 'createdAt' }).sortBy,
    ).toBe('createdAt');
    expect(supplierListQuerySchema.safeParse({ page: 1, pageSize: 20, sortBy: 'code' }).success).toBe(
      false,
    );
  });

  it('sortOrder 只接受 asc / desc', () => {
    expect(
      supplierListQuerySchema.parse({ page: 1, pageSize: 20, sortOrder: 'asc' }).sortOrder,
    ).toBe('asc');
    expect(
      supplierListQuerySchema.safeParse({ page: 1, pageSize: 20, sortOrder: 'up' }).success,
    ).toBe(false);
  });
});
