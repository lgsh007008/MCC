import { describe, expect, it } from 'vitest';
import { formatAmount, formatQuantity } from './format';

// 展示精度（product/生产与库存.md R-生产-002）：金额 2 位，其余数字 3 位，四舍五入。
describe('库存数值展示', () => {
  it('金额保留 2 位、数量与平均成本保留 3 位', () => {
    expect(formatAmount('1145.826000')).toBe('1145.83');
    expect(formatAmount('500')).toBe('500.00');
    expect(formatQuantity('1000.000000')).toBe('1000.000');
    expect(formatQuantity('0.0005')).toBe('0.001');
    expect(formatQuantity('0.0004')).toBe('0.000');
  });

  it('负值与空值', () => {
    expect(formatQuantity('-1.0000')).toBe('-1.000');
    expect(formatAmount('-0.001')).toBe('0.00');
    expect(formatAmount(null)).toBe('—');
    expect(formatQuantity(undefined)).toBe('—');
  });
});
