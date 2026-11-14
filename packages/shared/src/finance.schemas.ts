import { z } from 'zod';
import { dateStringSchema } from './date.schemas';
import { paginationQuerySchema } from './pagination.schemas';

// 财务领域的边界校验 schema（design/finance.md）：前后端共用同一份，
// 金额以字符串承载（禁浮点，技术方案 §5.1），服务层以 ZodValidationPipe 落地。
// 资金流水是唯一录入入口：方向 + 收支分类决定经营口径。

const positiveMoneyRe = /^\d+(\.\d{1,2})?$/; // 正数、最多 2 位小数

const occurredDateSchema = dateStringSchema('发生日期');

const positiveMoneySchema = z
  .string()
  .regex(positiveMoneyRe, '金额须为正数、最多 2 位小数')
  .refine((value) => !/^0+(\.0{1,2})?$/.test(value), { message: '金额必须大于 0' });

export const financeSummaryQuerySchema = z.object({
  dateFrom: occurredDateSchema.optional(),
  dateTo: occurredDateSchema.optional(),
});
export type FinanceSummaryQuery = z.infer<typeof financeSummaryQuerySchema>;

// ── 资金收付（R-财务-002）─────────────────────────────────

export const zeroOrPositiveMoneySchema = z
  .string()
  .regex(positiveMoneyRe, '金额须为非负数、最多 2 位小数');

export const financeAccountKindSchema = z.enum(['corporate', 'personal']);
export type FinanceAccountKindValue = z.infer<typeof financeAccountKindSchema>;

export const financeAccountChannelSchema = z.enum(['bank', 'wechat', 'alipay', 'cash', 'bill']);
export type FinanceAccountChannelValue = z.infer<typeof financeAccountChannelSchema>;

// 类型与渠道级联：对公 = 银行 / 承兑汇票；对私 = 银行 / 微信 / 支付宝 / 现金
export const FINANCE_ACCOUNT_CHANNELS_BY_KIND: Record<
  FinanceAccountKindValue,
  FinanceAccountChannelValue[]
> = {
  corporate: ['bank', 'bill'],
  personal: ['bank', 'wechat', 'alipay', 'cash'],
};

export const financeAccountInputSchema = z
  .object({
    name: z.string().trim().min(1, '请输入账户名称').max(40),
    kind: financeAccountKindSchema,
    channel: financeAccountChannelSchema,
    openingBalance: zeroOrPositiveMoneySchema.default('0.00'),
    active: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (!FINANCE_ACCOUNT_CHANNELS_BY_KIND[value.kind].includes(value.channel)) {
      ctx.addIssue({ code: 'custom', message: '渠道与账户类型不匹配', path: ['channel'] });
    }
  });
export type FinanceAccountInput = z.infer<typeof financeAccountInputSchema>;

export const financeCashDirectionSchema = z.enum(['in', 'out', 'transfer']);
export type FinanceCashDirectionValue = z.infer<typeof financeCashDirectionSchema>;

export const financeCashMethodSchema = z.enum(['bank', 'wechat', 'alipay', 'cash', 'acceptance']);
export type FinanceCashMethodValue = z.infer<typeof financeCashMethodSchema>;

// 收支分类：收款 3 项、付款 5 项；内部转账无分类
export const financeCashCategorySchema = z.enum([
  'sales_receipt',
  'other_revenue',
  'loan_in',
  'purchase_payment',
  'labor_cost',
  'operating_expense',
  'asset_purchase',
  'loan_repay',
]);
export type FinanceCashCategoryValue = z.infer<typeof financeCashCategorySchema>;

export const FINANCE_CASH_CATEGORY_LABELS: Record<FinanceCashCategoryValue, string> = {
  sales_receipt: '销售回款',
  other_revenue: '其他收入',
  loan_in: '借款',
  purchase_payment: '采购付款',
  labor_cost: '工资',
  operating_expense: '费用',
  asset_purchase: '资产购置',
  loan_repay: '还款',
};

export const FINANCE_CASH_CATEGORIES_BY_DIRECTION: Record<
  'in' | 'out',
  FinanceCashCategoryValue[]
> = {
  in: ['sales_receipt', 'other_revenue', 'loan_in'],
  out: ['purchase_payment', 'labor_cost', 'operating_expense', 'asset_purchase', 'loan_repay'],
};

// 计入经营收支的分类（收款 / 付款各一组）；其余只影响资金与往来
// 采购付款不在此列：采购成本按采购单应计，由业务汇总单独取数（R-财务-001）
export const FINANCE_OPERATING_CATEGORIES = {
  revenue: ['other_revenue'] as FinanceCashCategoryValue[],
  expense: ['labor_cost', 'operating_expense'] as FinanceCashCategoryValue[],
};

export const financeCashEntryInputSchema = z
  .object({
    direction: financeCashDirectionSchema,
    occurredDate: occurredDateSchema,
    amount: positiveMoneySchema,
    accountId: z.string().uuid(),
    toAccountId: z.string().uuid().nullable().optional(),
    category: financeCashCategorySchema.nullable().optional(),
    customerId: z.string().uuid().nullable().optional(),
    supplierId: z.string().uuid().nullable().optional(),
    note: z.string().trim().max(200).default(''),
  })
  .superRefine((value, ctx) => {
    if (value.direction === 'transfer') {
      if (value.category) {
        ctx.addIssue({ code: 'custom', message: '内部转账不设置收支分类', path: ['category'] });
      }
      if (!value.toAccountId) {
        ctx.addIssue({ code: 'custom', message: '内部转账须选择转入账户', path: ['toAccountId'] });
      } else if (value.toAccountId === value.accountId) {
        ctx.addIssue({ code: 'custom', message: '转入账户不能与转出账户相同', path: ['toAccountId'] });
      }
      if (value.customerId) {
        ctx.addIssue({ code: 'custom', message: '内部转账不关联客户', path: ['customerId'] });
      }
      if (value.supplierId) {
        ctx.addIssue({ code: 'custom', message: '内部转账不关联供应商', path: ['supplierId'] });
      }
      return;
    }
    const allowed = FINANCE_CASH_CATEGORIES_BY_DIRECTION[value.direction];
    if (!value.category) {
      ctx.addIssue({ code: 'custom', message: '请选择收支分类', path: ['category'] });
      return;
    }
    if (!allowed.includes(value.category)) {
      ctx.addIssue({ code: 'custom', message: '收支分类与方向不匹配', path: ['category'] });
      return;
    }
    if (value.direction === 'in') {
      if (value.category === 'sales_receipt' && !value.customerId) {
        ctx.addIssue({ code: 'custom', message: '销售回款须选择客户', path: ['customerId'] });
      }
      if (value.category !== 'sales_receipt' && value.customerId) {
        ctx.addIssue({
          code: 'custom',
          message: '仅销售回款可关联客户',
          path: ['customerId'],
        });
      }
      if (value.supplierId) {
        ctx.addIssue({ code: 'custom', message: '收款不关联供应商', path: ['supplierId'] });
      }
    }
    if (value.direction === 'out') {
      if (value.customerId) {
        ctx.addIssue({ code: 'custom', message: '付款不关联客户', path: ['customerId'] });
      }
      if (value.category === 'purchase_payment' && !value.supplierId) {
        ctx.addIssue({ code: 'custom', message: '采购付款须选择供应商', path: ['supplierId'] });
      }
      if (value.category !== 'purchase_payment' && value.supplierId) {
        ctx.addIssue({
          code: 'custom',
          message: '仅采购付款可关联供应商',
          path: ['supplierId'],
        });
      }
    }
  });
export type FinanceCashEntryInput = z.infer<typeof financeCashEntryInputSchema>;
export const financeCashEntryUpdateSchema = financeCashEntryInputSchema;
export type FinanceCashEntryUpdateInput = z.infer<typeof financeCashEntryUpdateSchema>;

export const financeCashEntryListQuerySchema = paginationQuerySchema.extend({
  direction: financeCashDirectionSchema.optional(),
  category: financeCashCategorySchema.optional(),
  accountId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  dateFrom: occurredDateSchema.optional(),
  dateTo: occurredDateSchema.optional(),
});
export type FinanceCashEntryListQuery = z.infer<typeof financeCashEntryListQuerySchema>;

export const financeCashSummaryQuerySchema = z.object({
  dateFrom: occurredDateSchema.optional(),
  dateTo: occurredDateSchema.optional(),
});
export type FinanceCashSummaryQuery = z.infer<typeof financeCashSummaryQuerySchema>;

export const financeReceivablesQuerySchema = z.object({
  customerIds: z.string().trim().min(1, '缺少客户 id'),
});
export type FinanceReceivablesQuery = z.infer<typeof financeReceivablesQuerySchema>;

export const financePayablesQuerySchema = z.object({
  supplierIds: z.string().trim().min(1, '缺少供应商 id'),
});
export type FinancePayablesQuery = z.infer<typeof financePayablesQuerySchema>;

