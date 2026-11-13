// 财务领域计算纯函数（design/finance.md §3）：
// 经营收支汇总、账户余额与应收，服务端与 web 共用；单测为最高优先级（技术方案 §10）。
// 金额一律为字符串 + BigInt 运算（含负数），禁止浮点。

import type { FinanceCashCategoryValue } from './finance.schemas';

const MONEY_SCALE = 2;

// 有符号小数字符串 → BigInt（放大 10^2）
function toScaled(value: string): bigint {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [intPart = '0', fracPart = ''] = unsigned.split('.');
  const fracPadded = (fracPart + '0'.repeat(MONEY_SCALE)).slice(0, MONEY_SCALE);
  const scaled = BigInt((intPart || '0') + fracPadded);
  return negative ? -scaled : scaled;
}

// BigInt → 有符号 2 位小数字符串
function fromScaled(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const digits = abs.toString().padStart(MONEY_SCALE + 1, '0');
  const intPart = digits.slice(0, -MONEY_SCALE);
  const fracPart = digits.slice(-MONEY_SCALE);
  return `${negative ? '-' : ''}${intPart}.${fracPart}`;
}

// 金额绝对值
export function absMoney(value: string): string {
  return fromScaled(toScaled(value) < 0n ? -toScaled(value) : toScaled(value));
}

// 金额求和（任意项，含负数）
export function sumMoney(values: string[]): string {
  return fromScaled(values.reduce((acc, value) => acc + toScaled(value), 0n));
}

// ── 经营收支汇总（R-财务-001）────────────────────────────
// 销售按应计（销售单合计，现结取实收、赊销取合计），其余按流水分类的实际收付。

export type BusinessSummaryCategory =
  | 'sales_revenue'
  | 'other_revenue'
  | 'purchase_payment'
  | 'labor_cost'
  | 'operating_expense';

export const BUSINESS_SUMMARY_CATEGORIES: BusinessSummaryCategory[] = [
  'sales_revenue',
  'other_revenue',
  'purchase_payment',
  'labor_cost',
  'operating_expense',
];

export const BUSINESS_SUMMARY_CATEGORY_LABELS: Record<BusinessSummaryCategory, string> = {
  sales_revenue: '销售收入',
  other_revenue: '其他收入',
  purchase_payment: '采购付款',
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

// 流水分类 → 经营收支项；销售回款 / 借款 / 还款 / 资产购置 / 内部转账不计入
const CASH_CATEGORY_TO_BUSINESS: Partial<
  Record<FinanceCashCategoryValue, BusinessSummaryCategory>
> = {
  other_revenue: 'other_revenue',
  purchase_payment: 'purchase_payment',
  labor_cost: 'labor_cost',
  operating_expense: 'operating_expense',
};

export function calcBusinessSummary(
  salesAmounts: string[],
  cashLines: BusinessCashLine[],
): BusinessSummary {
  const buckets = new Map<BusinessSummaryCategory, bigint>(
    BUSINESS_SUMMARY_CATEGORIES.map((category) => [category, 0n]),
  );
  for (const amount of salesAmounts) {
    buckets.set('sales_revenue', (buckets.get('sales_revenue') ?? 0n) + toScaled(amount));
  }
  for (const line of cashLines) {
    const target = CASH_CATEGORY_TO_BUSINESS[line.category];
    if (!target) {
      continue;
    }
    buckets.set(target, (buckets.get(target) ?? 0n) + toScaled(line.amount));
  }
  const totalIncome =
    (buckets.get('sales_revenue') ?? 0n) + (buckets.get('other_revenue') ?? 0n);
  const totalExpense =
    (buckets.get('purchase_payment') ?? 0n) +
    (buckets.get('labor_cost') ?? 0n) +
    (buckets.get('operating_expense') ?? 0n);
  return {
    totalIncome: fromScaled(totalIncome),
    totalExpense: fromScaled(totalExpense),
    netAmount: fromScaled(totalIncome - totalExpense),
    byCategory: BUSINESS_SUMMARY_CATEGORIES.map((category) => ({
      category,
      amount: fromScaled(buckets.get(category) ?? 0n),
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

// 客户欠款 = 累计销售 − 累计收款；负数为预收（不截断）
export function calcReceivable(salesAmounts: string[], receiptAmounts: string[]): string {
  return sumMoney([...salesAmounts, ...receiptAmounts.map((value) => `-${value}`)]);
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
