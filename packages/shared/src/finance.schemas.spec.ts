import { describe, expect, it } from 'vitest';
import {
  financeAccountInputSchema,
  financeCashEntryInputSchema,
  financeCashEntryListQuerySchema,
} from './finance.schemas';

// 账户类型与渠道级联（product/finance.md R-财务-002）：对公 = 银行 / 承兑汇票；对私 = 银行 / 微信 / 支付宝 / 现金。
describe('资金账户类型与渠道级联', () => {
  const base = { name: '账户', openingBalance: '0.00' };

  it('对公接受银行与承兑汇票，拒绝微信', () => {
    expect(financeAccountInputSchema.safeParse({ ...base, kind: 'corporate', channel: 'bank' }).success).toBe(true);
    expect(financeAccountInputSchema.safeParse({ ...base, kind: 'corporate', channel: 'bill' }).success).toBe(true);
    expect(financeAccountInputSchema.safeParse({ ...base, kind: 'corporate', channel: 'wechat' }).success).toBe(false);
  });

  it('对私接受银行 / 微信 / 支付宝 / 现金，拒绝承兑汇票', () => {
    for (const channel of ['bank', 'wechat', 'alipay', 'cash']) {
      expect(financeAccountInputSchema.safeParse({ ...base, kind: 'personal', channel }).success).toBe(true);
    }
    expect(financeAccountInputSchema.safeParse({ ...base, kind: 'personal', channel: 'bill' }).success).toBe(false);
  });
});

// 资金流水收支分类（product/finance.md R-财务-002）：分类与方向必须匹配，客户只属于销售回款。
describe('资金流水收支分类', () => {
  const accountId = '11111111-1111-4111-8111-111111111111';
  const toAccountId = '22222222-2222-4222-8222-222222222222';
  const customerId = '33333333-3333-4333-8333-333333333333';
  const base = {
    occurredDate: '2026-11-13',
    amount: '100.00',
    accountId,
    note: '',
  };

  it('销售回款必须挂客户，其他收款不挂客户', () => {
    expect(
      financeCashEntryInputSchema.safeParse({
        ...base,
        direction: 'in',
        category: 'sales_receipt',
        customerId,
      }).success,
    ).toBe(true);
    expect(
      financeCashEntryInputSchema.safeParse({
        ...base,
        direction: 'in',
        category: 'sales_receipt',
        customerId: null,
      }).success,
    ).toBe(false);
    expect(
      financeCashEntryInputSchema.safeParse({
        ...base,
        direction: 'in',
        category: 'other_revenue',
        customerId,
      }).success,
    ).toBe(false);
    expect(
      financeCashEntryInputSchema.safeParse({
        ...base,
        direction: 'in',
        category: 'loan_in',
        customerId: null,
      }).success,
    ).toBe(true);
  });

  it('付款分类只接受付款项，且不挂客户', () => {
    expect(
      financeCashEntryInputSchema.safeParse({
        ...base,
        direction: 'out',
        category: 'purchase_payment',
      }).success,
    ).toBe(true);
    expect(
      financeCashEntryInputSchema.safeParse({
        ...base,
        direction: 'out',
        category: 'asset_purchase',
      }).success,
    ).toBe(true);
    expect(
      financeCashEntryInputSchema.safeParse({
        ...base,
        direction: 'out',
        category: 'sales_receipt',
      }).success,
    ).toBe(false);
    expect(
      financeCashEntryInputSchema.safeParse({
        ...base,
        direction: 'out',
        category: 'operating_expense',
        customerId,
      }).success,
    ).toBe(false);
  });

  it('内部转账不设分类，必须选择不同的转入账户', () => {
    expect(
      financeCashEntryInputSchema.safeParse({
        ...base,
        direction: 'transfer',
        toAccountId,
      }).success,
    ).toBe(true);
    expect(
      financeCashEntryInputSchema.safeParse({
        ...base,
        direction: 'transfer',
        toAccountId: accountId,
      }).success,
    ).toBe(false);
    expect(
      financeCashEntryInputSchema.safeParse({
        ...base,
        direction: 'transfer',
        toAccountId,
        category: 'other_revenue',
      }).success,
    ).toBe(false);
  });

  it('列表查询接受分类筛选', () => {
    expect(financeCashEntryListQuerySchema.parse({ category: 'operating_expense' }).category).toBe(
      'operating_expense',
    );
    expect(financeCashEntryListQuerySchema.safeParse({ category: 'unknown' }).success).toBe(false);
  });
});
