import { describe, expect, it } from 'vitest';
import {
  absMoney,
  calcAccountBalance,
  calcBusinessSummary,
  calcReceivable,
  calcSettlementDifference,
  sumMoney,
} from './finance.calc';

// 财务计算纯函数单测（design/finance.md §3；技术方案 §10 纯函数最高优先级）

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

describe('经营收支汇总（R-财务-001）', () => {
  const cashLines = [
    { category: 'other_revenue' as const, amount: '200.50' },
    { category: 'purchase_payment' as const, amount: '300.00' },
    { category: 'labor_cost' as const, amount: '400.00' },
    { category: 'operating_expense' as const, amount: '150.25' },
    { category: 'sales_receipt' as const, amount: '580.00' },
    { category: 'loan_in' as const, amount: '1000.00' },
    { category: 'asset_purchase' as const, amount: '5000.00' },
    { category: 'loan_repay' as const, amount: '200.00' },
  ];

  it('销售按应计、其余按分类收付，非经营分类全部排除', () => {
    const summary = calcBusinessSummary(['1000.00', '500.00'], cashLines);
    expect(summary.totalIncome).toBe('1700.50');
    expect(summary.totalExpense).toBe('850.25');
    expect(summary.netAmount).toBe('850.25');
    expect(summary.byCategory).toEqual([
      { category: 'sales_revenue', amount: '1500.00' },
      { category: 'other_revenue', amount: '200.50' },
      { category: 'purchase_payment', amount: '300.00' },
      { category: 'labor_cost', amount: '400.00' },
      { category: 'operating_expense', amount: '150.25' },
    ]);
  });

  it('空数据输出五项全零', () => {
    const summary = calcBusinessSummary([], []);
    expect(summary).toMatchObject({
      totalIncome: '0.00',
      totalExpense: '0.00',
      netAmount: '0.00',
    });
    expect(summary.byCategory).toHaveLength(5);
    expect(summary.byCategory.every((row) => row.amount === '0.00')).toBe(true);
  });
});

describe('资金账户余额（R-财务-002）', () => {
  const entries = [
    { direction: 'in' as const, amount: '200.00', accountId: 'a', toAccountId: null },
    { direction: 'out' as const, amount: '50.00', accountId: 'a', toAccountId: null },
    { direction: 'transfer' as const, amount: '300.00', accountId: 'a', toAccountId: 'b' },
    { direction: 'in' as const, amount: '20.00', accountId: 'b', toAccountId: null },
  ];

  it('余额 = 期初 + 收 − 付 + 转入 − 转出，转账不重复累加', () => {
    expect(calcAccountBalance('a', '1000.00', entries)).toBe('850.00');
    expect(calcAccountBalance('b', '0.00', entries)).toBe('320.00');
  });

  it('无流水时等于期初', () => {
    expect(calcAccountBalance('a', '0.00', [])).toBe('0.00');
  });
});

describe('应收（R-财务-002）', () => {
  it('欠款 = 期初欠款 + 累计销售 − 累计收款', () => {
    expect(calcReceivable(['1000.00'], ['400.00'])).toBe('600.00');
    expect(calcReceivable(['1000.00', '500.50'], ['400.00'])).toBe('1100.50');
  });

  it('期初欠款作为基数参与计算，缺省为 0', () => {
    expect(calcReceivable(['0.00'], ['0.00'], '100000.00')).toBe('100000.00');
    expect(calcReceivable(['5000.00'], ['2000.00'], '100000.00')).toBe('103000.00');
    expect(calcReceivable(['1000.00'], ['400.00'], '0.00')).toBe('600.00');
  });

  it('负数为预收，不截断', () => {
    expect(calcReceivable(['0.00'], ['200.00'])).toBe('-200.00');
    expect(calcReceivable(['0.00'], ['30000.00'], '0.00')).toBe('-30000.00');
  });
});

describe('销售单结算（R-财务-002 一次录入）', () => {
  it('差额 = 合计 − 实收：正数抹零折让，负数预收', () => {
    expect(calcSettlementDifference('600.00', '580.00')).toBe('20.00');
    expect(calcSettlementDifference('600.00', '620.00')).toBe('-20.00');
    expect(calcSettlementDifference('600.00', '600.00')).toBe('0.00');
  });
});
