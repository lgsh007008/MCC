// 财务领域计算纯函数（design/finance.md §3）：
// 单式台账的符号规范化与收支汇总，服务端与 web 共用；单测为最高优先级（技术方案 §10）。
// 金额一律为字符串 + BigInt 运算（含负数），禁止浮点。

export type FinanceCategory =
  | 'sales_revenue'
  | 'other_revenue'
  | 'purchase_cost'
  | 'labor_cost'
  | 'other_expense';

export const FINANCE_CATEGORIES: FinanceCategory[] = [
  'sales_revenue',
  'other_revenue',
  'purchase_cost',
  'labor_cost',
  'other_expense',
];

export const FINANCE_CATEGORY_LABELS: Record<FinanceCategory, string> = {
  sales_revenue: '销售收入',
  other_revenue: '其他收入',
  purchase_cost: '采购成本',
  labor_cost: '人工成本',
  other_expense: '其他支出',
};

// 手工可录入的分类（系统类分类由业务单据自动生成，不允许手工记账）
export const MANUAL_FINANCE_CATEGORIES: FinanceCategory[] = ['other_revenue', 'other_expense'];

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

export function isIncomeCategory(category: FinanceCategory): boolean {
  return category === 'sales_revenue' || category === 'other_revenue';
}

// 手工录入金额按正数提交，落库前按分类转有符号（收入正、支出负）
export function signedAmount(category: FinanceCategory, positiveAmount: string): string {
  const scaled = toScaled(positiveAmount);
  return fromScaled(isIncomeCategory(category) ? scaled : -scaled);
}

// 金额绝对值
export function absMoney(value: string): string {
  return fromScaled(toScaled(value) < 0n ? -toScaled(value) : toScaled(value));
}

// 金额求和（任意项，含负数）
export function sumMoney(values: string[]): string {
  return fromScaled(values.reduce((acc, value) => acc + toScaled(value), 0n));
}

export interface FinanceSummaryLine {
  category: FinanceCategory;
  amount: string;
}

export interface FinanceCategorySubtotal {
  category: FinanceCategory;
  income: string;
  cost: string;
  net: string;
}

export interface FinanceSummary {
  totalIncome: string;
  totalCost: string;
  netProfit: string;
  byCategory: FinanceCategorySubtotal[];
}

// 收支汇总：总收入 = Σ正数；总成本 = Σ负数绝对值；净利润 = 总收入 − 总成本。
// 分类小计按五类固定输出（无数据为 0），保证报表行稳定。
export function calcFinanceSummary(items: FinanceSummaryLine[]): FinanceSummary {
  let income = 0n;
  let cost = 0n;
  const buckets = new Map<FinanceCategory, { income: bigint; cost: bigint }>(
    FINANCE_CATEGORIES.map((category) => [category, { income: 0n, cost: 0n }]),
  );

  for (const item of items) {
    const scaled = toScaled(item.amount);
    const bucket = buckets.get(item.category) ?? { income: 0n, cost: 0n };
    if (scaled >= 0n) {
      income += scaled;
      bucket.income += scaled;
    } else {
      cost += -scaled;
      bucket.cost += -scaled;
    }
    buckets.set(item.category, bucket);
  }

  return {
    totalIncome: fromScaled(income),
    totalCost: fromScaled(cost),
    netProfit: fromScaled(income - cost),
    byCategory: FINANCE_CATEGORIES.map((category) => {
      const bucket = buckets.get(category) ?? { income: 0n, cost: 0n };
      return {
        category,
        income: fromScaled(bucket.income),
        cost: fromScaled(bucket.cost),
        net: fromScaled(bucket.income - bucket.cost),
      };
    }),
  };
}
