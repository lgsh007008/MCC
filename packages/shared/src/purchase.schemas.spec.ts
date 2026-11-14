import { describe, expect, it } from 'vitest';
import { purchaseListQuerySchema } from './purchase.schemas';

// 采购列表查询（product/purchase.md 移动页）：supplierName 为名称快照模糊搜索，可空、去首尾空格。

describe('采购列表查询', () => {
  it('不传 supplierName 时为 undefined', () => {
    const parsed = purchaseListQuerySchema.parse({ page: 1, pageSize: 20 });
    expect(parsed.supplierName).toBeUndefined();
  });

  it('supplierName 去首尾空格、保留内部空格', () => {
    const parsed = purchaseListQuerySchema.parse({
      page: 1,
      pageSize: 20,
      supplierName: '  梅好 木业  ',
    });
    expect(parsed.supplierName).toBe('梅好 木业');
  });

  it('supplierName 超过 100 字报错', () => {
    expect(
      purchaseListQuerySchema.safeParse({ page: 1, pageSize: 20, supplierName: 'a'.repeat(101) })
        .success,
    ).toBe(false);
  });

  it('sortBy 只接受 purchaseDate / totalAmount', () => {
    expect(
      purchaseListQuerySchema.parse({ page: 1, pageSize: 20, sortBy: 'totalAmount' }).sortBy,
    ).toBe('totalAmount');
    expect(purchaseListQuerySchema.safeParse({ page: 1, pageSize: 20, sortBy: 'code' }).success).toBe(
      false,
    );
  });

  it('sortOrder 只接受 asc / desc', () => {
    expect(purchaseListQuerySchema.parse({ page: 1, pageSize: 20, sortOrder: 'asc' }).sortOrder).toBe(
      'asc',
    );
    expect(
      purchaseListQuerySchema.safeParse({ page: 1, pageSize: 20, sortOrder: 'up' }).success,
    ).toBe(false);
  });
});
