import { describe, expect, it } from 'vitest';
import {
  absMoney,
  calcFinanceSummary,
  isIncomeCategory,
  signedAmount,
  sumMoney,
} from './finance.calc';

// 财务计算纯函数单测（design/finance.md §3；技术方案 §10 纯函数最高优先级）

describe('财务金额符号', () => {
  it('收入类为正、成本费用类为负', () => {
    expect(signedAmount('other_revenue', '1200.50')).toBe('1200.50');
    expect(signedAmount('sales_revenue', '300')).toBe('300.00');
    expect(signedAmount('other_expense', '350.25')).toBe('-350.25');
    expect(signedAmount('purchase_cost', '100')).toBe('-100.00');
    expect(signedAmount('labor_cost', '0.05')).toBe('-0.05');
  });

  it('分类方向判定', () => {
    expect(isIncomeCategory('sales_revenue')).toBe(true);
    expect(isIncomeCategory('other_revenue')).toBe(true);
    expect(isIncomeCategory('purchase_cost')).toBe(false);
    expect(isIncomeCategory('labor_cost')).toBe(false);
    expect(isIncomeCategory('other_expense')).toBe(false);
  });
});

describe('财务金额运算', () => {
  it('求和支持正负混合', () => {
    expect(sumMoney(['100.10', '-30.05', '0.05'])).toBe('70.10');
    expect(sumMoney(['-5.50', '-4.50'])).toBe('-10.00');
    expect(sumMoney([])).toBe('0.00');
  });

  it('绝对值', () => {
    expect(absMoney('-350.25')).toBe('350.25');
    expect(absMoney('12.30')).toBe('12.30');
  });
});

describe('收支汇总', () => {
  it('总收入 / 总成本 / 净利润与分类小计', () => {
    const summary = calcFinanceSummary([
      { category: 'sales_revenue', amount: '1000.00' },
      { category: 'other_revenue', amount: '200.50' },
      { category: 'other_expense', amount: '-150.25' },
      { category: 'purchase_cost', amount: '-300.00' },
    ]);
    expect(summary.totalIncome).toBe('1200.50');
    expect(summary.totalCost).toBe('450.25');
    expect(summary.netProfit).toBe('750.25');
    expect(summary.byCategory).toHaveLength(5);
    expect(summary.byCategory.find((row) => row.category === 'sales_revenue')).toEqual({
      category: 'sales_revenue',
      income: '1000.00',
      cost: '0.00',
      net: '1000.00',
    });
    expect(summary.byCategory.find((row) => row.category === 'other_expense')).toEqual({
      category: 'other_expense',
      income: '0.00',
      cost: '150.25',
      net: '-150.25',
    });
  });

  it('空数据输出五类全零', () => {
    const summary = calcFinanceSummary([]);
    expect(summary).toMatchObject({ totalIncome: '0.00', totalCost: '0.00', netProfit: '0.00' });
    expect(summary.byCategory).toHaveLength(5);
    expect(summary.byCategory.every((row) => row.income === '0.00' && row.cost === '0.00')).toBe(
      true,
    );
  });
});
