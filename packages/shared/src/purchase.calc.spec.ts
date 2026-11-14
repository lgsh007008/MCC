import { describe, expect, it } from 'vitest';
import { calcPurchaseSubtotal, calcPurchaseTotal } from './purchase.calc';

// 采购金额纯函数单测（design/purchase.md §3；技术方案 §10 纯函数最高优先级）

describe('采购金额（R-采购-001）', () => {
  it('小计 = 结算吨数 × 单价，四舍五入 2 位', () => {
    expect(calcPurchaseSubtotal('1.500', '100.00')).toBe('150.00');
    expect(calcPurchaseSubtotal('0.333', '10.00')).toBe('3.33');
    expect(calcPurchaseSubtotal('1.005', '1.00')).toBe('1.01');
    expect(calcPurchaseSubtotal('12.345', '678.90')).toBe('8381.02');
  });

  it('合计 = 小计 + 其他金额', () => {
    expect(calcPurchaseTotal('150.00', '20.00')).toBe('170.00');
    expect(calcPurchaseTotal('8380.82', '0.00')).toBe('8380.82');
  });
});
