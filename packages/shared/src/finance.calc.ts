// 财务领域计算纯函数（design/finance.md §3）：
// 经营收支汇总、账户余额与应收，服务端与 web 共用；单测为最高优先级（技术方案 §10）。
// 金额一律为字符串 + BigInt 运算（含负数），禁止浮点。

import type { FinanceCashCategoryValue } from './finance.schemas';
import { fromScaled, toScaled } from './money';

const MONEY_SCALE = 2;

// 金额绝对值
export function absMoney(value: string): string {
  return fromScaled(
    toScaled(value, MONEY_SCALE) < 0n
      ? -toScaled(value, MONEY_SCALE)
      : toScaled(value, MONEY_SCALE),
    MONEY_SCALE,
  );
}

// 金额求和（任意项，含负数）
export function sumMoney(values: string[]): string {
  return fromScaled(
    values.reduce((acc, value) => acc + toScaled(value, MONEY_SCALE), 0n),
    MONEY_SCALE,
  );
}

// ── 经营收支汇总（R-财务-001）────────────────────────────
// 销售与采购均按应计（单据确认即计入，含赊销 / 赊购），其余按流水分类的实际收付。

export type BusinessSummaryCategory =
  | 'sales_revenue'
  | 'other_revenue'
  | 'purchase_expense'
  | 'labor_cost'
  | 'operating_expense';

export const BUSINESS_SUMMARY_CATEGORIES: BusinessSummaryCategory[] = [
  'sales_revenue',
  'other_revenue',
  'purchase_expense',
  'labor_cost',
  'operating_expense',
];

export const BUSINESS_SUMMARY_CATEGORY_LABELS: Record<BusinessSummaryCategory, string> = {
  sales_revenue: '销售收入',
  other_revenue: '其他收入',
  purchase_expense: '采购支出',
  labor_cost: '工资',
  operating_expense: '费用',
};

export interface BusinessCashLine {
  category: FinanceCashCategoryValue;
  amount: string; // 正数
}

export interface BusinessSummary {
  totalIncome: string;
  totalExpense: string;
  netAmount: string;
  byCategory: Array<{ category: BusinessSummaryCategory; amount: string }>;
}

// 流水分类 → 经营收支项；销售回款 / 采购付款 / 借款 / 还款 / 资产购置 / 内部转账不计入
const CASH_CATEGORY_TO_BUSINESS: Partial<
  Record<FinanceCashCategoryValue, BusinessSummaryCategory>
> = {
  other_revenue: 'other_revenue',
  labor_cost: 'labor_cost',
  operating_expense: 'operating_expense',
};

export function calcBusinessSummary(
  salesAmounts: string[],
  purchaseAmounts: string[],
  cashLines: BusinessCashLine[],
): BusinessSummary {
  // 分类桶用 Record 穷举初始化（新增分类时 TS 会报缺键），避免 Map 取值处处兜底 0n
  const buckets: Record<BusinessSummaryCategory, bigint> = {
    sales_revenue: 0n,
    other_revenue: 0n,
    purchase_expense: 0n,
    labor_cost: 0n,
    operating_expense: 0n,
  };
  for (const amount of salesAmounts) {
    buckets.sales_revenue += toScaled(amount, MONEY_SCALE);
  }
  for (const amount of purchaseAmounts) {
    buckets.purchase_expense += toScaled(amount, MONEY_SCALE);
  }
  for (const line of cashLines) {
    const target = CASH_CATEGORY_TO_BUSINESS[line.category];
    if (!target) {
      continue;
    }
    buckets[target] += toScaled(line.amount, MONEY_SCALE);
  }
  const totalIncome = buckets.sales_revenue + buckets.other_revenue;
  const totalExpense =
    buckets.purchase_expense + buckets.labor_cost + buckets.operating_expense;
  return {
    totalIncome: fromScaled(totalIncome, MONEY_SCALE),
    totalExpense: fromScaled(totalExpense, MONEY_SCALE),
    netAmount: fromScaled(totalIncome - totalExpense, MONEY_SCALE),
    byCategory: BUSINESS_SUMMARY_CATEGORIES.map((category) => ({
      category,
      amount: fromScaled(buckets[category], MONEY_SCALE),
    })),
  };
}

// ── 资金收付与应收账款（R-财务-002）──────────────────────────

export type FinanceAccountKind = 'corporate' | 'personal';
export type FinanceAccountChannel = 'bank' | 'wechat' | 'alipay' | 'cash' | 'bill';
export type FinanceCashDirection = 'in' | 'out' | 'transfer';
export type FinanceCashMethod = 'bank' | 'wechat' | 'alipay' | 'cash' | 'acceptance';

export const FINANCE_ACCOUNT_KIND_LABELS: Record<FinanceAccountKind, string> = {
  corporate: '对公',
  personal: '对私',
};

export const FINANCE_ACCOUNT_CHANNEL_LABELS: Record<FinanceAccountChannel, string> = {
  bank: '银行',
  wechat: '微信',
  alipay: '支付宝',
  cash: '现金',
  bill: '承兑汇票',
};

export const FINANCE_CASH_DIRECTION_LABELS: Record<FinanceCashDirection, string> = {
  in: '收款',
  out: '付款',
  transfer: '内部转账',
};

export const FINANCE_CASH_METHOD_LABELS: Record<FinanceCashMethod, string> = {
  bank: '银行转账',
  wechat: '微信',
  alipay: '支付宝',
  cash: '现金',
  acceptance: '承兑汇票',
};

// 欠款 = 期初欠款 + 累计销售 − 累计收款（R-财务-002）：
// 期初欠款是客户档案录入的上线前净欠款；累计销售 / 收款只统计系统内数据，历史回款不补录。
// 负数为预收，不截断。
export function calcReceivable(
  salesAmounts: string[],
  receiptAmounts: string[],
  openingDebt = '0.00',
): string {
  return sumMoney([
    openingDebt,
    ...salesAmounts,
    ...receiptAmounts.map((value) => `-${value}`),
  ]);
}

// 应付 = 期初应付 + 累计采购 − 累计付款（R-财务-004）：
// 累计采购对现结单取实付、赊购单取合计；累计付款只取挂该供应商的采购付款流水。
// 负数为预付，不截断。
export function calcPayable(
  purchaseAmounts: string[],
  paymentAmounts: string[],
  openingPayable = '0.00',
): string {
  return sumMoney([
    openingPayable,
    ...purchaseAmounts,
    ...paymentAmounts.map((value) => `-${value}`),
  ]);
}

// 结算差额 = 合计 − 实收：正数为折让 / 抹零，负数为预收；只作单据信息
export function calcSettlementDifference(totalAmount: string, receivedAmount: string): string {
  return sumMoney([totalAmount, `-${receivedAmount}`]);
}

export interface CashBalanceLine {
  direction: FinanceCashDirection;
  amount: string;
  accountId: string;
  toAccountId?: string | null;
}

// 账户余额 = 期初 + 收款 − 付款 + 转入 − 转出；内部转账不计入收支统计
export function calcAccountBalance(
  accountId: string,
  openingBalance: string,
  entries: CashBalanceLine[],
): string {
  const deltas: string[] = [openingBalance];
  for (const entry of entries) {
    if (entry.direction === 'transfer') {
      if (entry.accountId === accountId) {
        deltas.push(`-${entry.amount}`);
      }
      if (entry.toAccountId === accountId) {
        deltas.push(entry.amount);
      }
      continue;
    }
    if (entry.accountId !== accountId) {
      continue;
    }
    deltas.push(entry.direction === 'in' ? entry.amount : `-${entry.amount}`);
  }
  return sumMoney(deltas);
}
