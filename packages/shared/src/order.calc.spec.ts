import { describe, expect, it } from 'vitest';
import {
  addAmounts,
  calcBoardLineAmount,
  calcOrderTotals,
  calcVolumeM3,
  sumVolumes,
} from './order.calc';

// 订单计算纯函数用例（design/order.md §3，最高优先级单测）：
// 覆盖方量公式、四舍五入、板材小计与整单汇总。
describe('方量计算 calcVolumeM3', () => {
  it('按 厚/100 × 宽/100 × 长/100 × 根数 计算', () => {
    expect(calcVolumeM3('2.000', '100.000', '200.000', 50)).toBe('2.0000');
    expect(calcVolumeM3('2.000', '80.000', '300.000', 3)).toBe('0.1440');
    expect(calcVolumeM3('10.000', '5.000', '100.000', 1)).toBe('0.0050');
  });

  it('保留 4 位小数，四舍五入（round half up）', () => {
    // 1cm×1cm×1cm×1 根 = 1e-6 m³；×50 = 0.00005 → 0.0001；×49 = 0.000049 → 0.0000
    expect(calcVolumeM3('1.000', '1.000', '1.000', 50)).toBe('0.0001');
    expect(calcVolumeM3('1.000', '1.000', '1.000', 49)).toBe('0.0000');
  });

  it('根数放大线性成立', () => {
    expect(calcVolumeM3('2.000', '100.000', '200.000', 1)).toBe('0.0400');
    expect(calcVolumeM3('2.000', '100.000', '200.000', 50)).toBe('2.0000');
  });
});

describe('板材小计 calcBoardLineAmount', () => {
  it('方量 × 单价，保留 2 位小数', () => {
    expect(calcBoardLineAmount('2.0000', '550.25')).toBe('1100.50');
    expect(calcBoardLineAmount('1.2345', '2.00')).toBe('2.47');
  });

  it('四舍五入（round half up）', () => {
    // 0.05 × 0.10 = 0.005 → 0.01；0.04 × 0.10 = 0.004 → 0.00
    expect(calcBoardLineAmount('0.05', '0.10')).toBe('0.01');
    expect(calcBoardLineAmount('0.04', '0.10')).toBe('0.00');
  });
});

describe('金额与方量汇总', () => {
  it('addAmounts 与 sumVolumes', () => {
    expect(addAmounts('1.25', '2.75', '0.00')).toBe('4.00');
    expect(addAmounts('0.10', '0.20', '0.30')).toBe('0.60');
    expect(sumVolumes(['0.1440', '0.0050'])).toBe('0.1490');
  });

  it('整单汇总：小计 = Σ(行小计+行其他金额)，合计 = 小计 + 主表其他金额', () => {
    const totals = calcOrderTotals(
      [
        { lineAmount: '10.01', otherAmount: '0.50', volumeM3: '2.0000' },
        { lineAmount: '5.00', otherAmount: '0.00', volumeM3: null },
      ],
      '30.00',
    );
    expect(totals).toEqual({ totalVolume: '2.0000', subtotalAmount: '15.51', totalAmount: '45.51' });
  });

  it('明细全为空方量时合计方量为 0', () => {
    expect(calcOrderTotals([{ lineAmount: '3.00', otherAmount: '0.00', volumeM3: null }], '0.00')).toEqual({
      totalVolume: '0.0000',
      subtotalAmount: '3.00',
      totalAmount: '3.00',
    });
  });
});