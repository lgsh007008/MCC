import { describe, expect, it } from 'vitest';
import {
  addAmounts,
  calcLineAmount,
  calcOrderTotals,
  calcPieceLineAmount,
  calcVolumeLineAmount,
  calcVolumeM3,
  sumVolumes,
} from './order.calc';

// 订单计算纯函数用例（design/order.md §3，最高优先级单测）：
// 覆盖整数毫米方量、两种计价方式、四舍五入与整单汇总。
describe('方量计算 calcVolumeM3（整数毫米）', () => {
  it('按 厚 × 宽 × 长 × 根数 ÷ 10⁹ 计算', () => {
    expect(calcVolumeM3(20, 100, 200, 50)).toBe('0.0200');
    expect(calcVolumeM3(20, 80, 300, 3)).toBe('0.0014');
    expect(calcVolumeM3(20, 100, 300, 10)).toBe('0.0060');
  });

  it('保留 4 位小数，四舍五入（round half up）', () => {
    // 2×5×5000×1 = 50,000 mm³ = 0.00005 m³ → 0.0001；49,990 → 0.0000
    expect(calcVolumeM3(2, 5, 5000, 1)).toBe('0.0001');
    expect(calcVolumeM3(2, 5, 4999, 1)).toBe('0.0000');
  });

  it('根数放大线性成立', () => {
    expect(calcVolumeM3(20, 100, 200, 1)).toBe('0.0004');
    expect(calcVolumeM3(20, 100, 200, 50)).toBe('0.0200');
  });
});

describe('按方量计价 calcVolumeLineAmount', () => {
  it('方量 × 单价，保留 2 位小数', () => {
    expect(calcVolumeLineAmount('2.0000', '550.25')).toBe('1100.50');
    expect(calcVolumeLineAmount('1.2345', '2.00')).toBe('2.47');
  });

  it('四舍五入（round half up）', () => {
    // 0.05 × 0.10 = 0.005 → 0.01；0.04 × 0.10 = 0.004 → 0.00
    expect(calcVolumeLineAmount('0.05', '0.10')).toBe('0.01');
    expect(calcVolumeLineAmount('0.04', '0.10')).toBe('0.00');
  });
});

describe('按根数计价 calcPieceLineAmount', () => {
  it('根数 × 单价', () => {
    expect(calcPieceLineAmount(10, '40.00')).toBe('400.00');
    expect(calcPieceLineAmount(3, '12.50')).toBe('37.50');
  });
});

describe('统一行金额入口 calcLineAmount', () => {
  it('按计价方式选择公式，方量两种方式都参与汇总', () => {
    const volume = calcVolumeM3(20, 100, 3000, 10); // 0.0600
    expect(calcLineAmount('volume', volume, 10, '600.00')).toBe('36.00');
    expect(calcLineAmount('piece', volume, 10, '40.00')).toBe('400.00');
  });
});

describe('金额与方量汇总', () => {
  it('addAmounts 与 sumVolumes', () => {
    expect(addAmounts('1.25', '2.75', '0.00')).toBe('4.00');
    expect(addAmounts('0.10', '0.20', '0.30')).toBe('0.60');
    expect(sumVolumes(['0.0600', '0.0014'])).toBe('0.0614');
  });

  it('整单汇总：小计 = Σ(行小计+行其他金额)，合计 = 小计 + 主表其他金额', () => {
    const totals = calcOrderTotals(
      [
        { lineAmount: '10.01', otherAmount: '0.50', volumeM3: '2.0000' },
        { lineAmount: '400.00', otherAmount: '0.00', volumeM3: '0.0600' },
      ],
      '30.00',
    );
    expect(totals).toEqual({ totalVolume: '2.0600', subtotalAmount: '410.51', totalAmount: '440.51' });
  });
});
