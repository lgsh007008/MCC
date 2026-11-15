import { describe, expect, it } from 'vitest';
import {
  inventoryAdjustmentReasonSchema,
  inventoryCountInputSchema,
  inventoryCountListQuerySchema,
} from './inventory.schemas';

// 库存盘点契约（product/生产与库存.md R-生产-003 / design/生产与库存.md §3.5）：
// 一张单只盘一类库存；实盘可留空（留空行不参与盘点）；原因选填。
describe('库存盘点输入', () => {
  it('原木单类型：实盘与原因都可留空', () => {
    const parsed = inventoryCountInputSchema.parse({
      targetType: 'raw_log',
      countDate: '2026-11-15',
      note: '',
      rawLog: {},
    });
    expect(parsed).toEqual({
      targetType: 'raw_log',
      countDate: '2026-11-15',
      note: '',
      rawLog: {},
    });
  });

  it('方木单类型：逐规格行录入实盘与原因', () => {
    const parsed = inventoryCountInputSchema.parse({
      targetType: 'timber',
      countDate: '2026-11-15',
      timber: [
        {
          lengthMm: 2500,
          widthMm: 100,
          heightMm: 20,
          actualQuantity: '0.0000',
          reason: 'damage',
        },
      ],
    });
    expect(parsed).toMatchObject({
      targetType: 'timber',
      timber: [expect.objectContaining({ actualQuantity: '0.0000', reason: 'damage' })],
    });
  });

  it('一张单只盘一类：原木单必须带原木行，不能只带方木行', () => {
    const result = inventoryCountInputSchema.safeParse({
      targetType: 'raw_log',
      countDate: '2026-11-15',
      timber: [],
    });
    expect(result.success).toBe(false);
  });

  it('原因枚举只保留计量误差 / 漏记 / 损耗 / 其他', () => {
    expect(inventoryAdjustmentReasonSchema.options).toEqual([
      'measurement',
      'missing',
      'damage',
      'other',
    ]);
    expect(
      inventoryCountInputSchema.safeParse({
        targetType: 'raw_log',
        countDate: '2026-11-15',
        rawLog: { actualQuantity: '1.000', reason: 'count_gain' },
      }).success,
    ).toBe(false);
  });

  it('实盘数量不允许负数或超出精度', () => {
    expect(
      inventoryCountInputSchema.safeParse({
        targetType: 'raw_log',
        countDate: '2026-11-15',
        rawLog: { actualQuantity: '-1.000' },
      }).success,
    ).toBe(false);
    expect(
      inventoryCountInputSchema.safeParse({
        targetType: 'timber',
        countDate: '2026-11-15',
        timber: [
          { lengthMm: 2500, widthMm: 100, heightMm: 20, actualQuantity: '1.00000' },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('盘点列表查询', () => {
  it('targetType 只接受 raw_log / timber', () => {
    expect(
      inventoryCountListQuerySchema.parse({ page: 1, pageSize: 20, targetType: 'timber' })
        .targetType,
    ).toBe('timber');
    expect(
      inventoryCountListQuerySchema.safeParse({ page: 1, pageSize: 20, targetType: 'mixed' })
        .success,
    ).toBe(false);
  });
});
