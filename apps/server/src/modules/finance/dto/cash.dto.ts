import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 资金收付 / 应收的契约形状（design/finance.md R-财务-002）。
// 运行时校验以 @mcc/shared 的 zod schema 为准，本文件只承载 OpenAPI 契约。

const ACCOUNT_KINDS = ['corporate', 'personal'];
const ACCOUNT_CHANNELS = ['bank', 'wechat', 'alipay', 'cash', 'bill'];
const CASH_DIRECTIONS = ['in', 'out', 'transfer'];
const CASH_METHODS = ['bank', 'wechat', 'alipay', 'cash', 'acceptance'];
const CASH_CATEGORIES = [
  'sales_receipt',
  'other_revenue',
  'loan_in',
  'purchase_payment',
  'labor_cost',
  'operating_expense',
  'asset_purchase',
  'loan_repay',
];

// ── 资金账户 ─────────────────────────────────────────────

export class FinanceAccountBodyDto {
  @ApiProperty({ type: String, description: '账户名称', example: '对公账户' })
  name!: string;

  @ApiProperty({ type: String, enum: ACCOUNT_KINDS, description: '类型：对公 / 对私' })
  kind!: 'corporate' | 'personal';

  @ApiProperty({ type: String, enum: ACCOUNT_CHANNELS, description: '渠道：银行 / 微信 / 支付宝 / 现金 / 承兑' })
  channel!: 'bank' | 'wechat' | 'alipay' | 'cash' | 'bill';

  @ApiProperty({ type: String, description: '期初余额（非负数）', example: '0.00' })
  openingBalance!: string;

  @ApiPropertyOptional({ type: Boolean, description: '是否启用', default: true })
  active?: boolean;
}

export class FinanceAccountDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, description: '账户编号（AC + 5 位流水）' }) code!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, enum: ACCOUNT_KINDS }) kind!: string;
  @ApiProperty({ type: String, enum: ACCOUNT_CHANNELS }) channel!: string;
  @ApiProperty({ type: String, description: '期初余额' }) openingBalance!: string;
  @ApiProperty({ type: String, description: '当前余额（期初 + 收 − 付 + 转入 − 转出）' }) balance!: string;
  @ApiProperty({ type: Boolean }) active!: boolean;
  @ApiPropertyOptional({ type: Number, description: '该账户的流水条数（列表返回，用于删除确认）' })
  entryCount?: number;
}

export class FinanceAccountListDto {
  @ApiProperty({ type: () => [FinanceAccountDto] }) items!: FinanceAccountDto[];
}

// ── 资金流水 ─────────────────────────────────────────────

export class FinanceCashEntryBodyDto {
  @ApiProperty({ type: String, enum: CASH_DIRECTIONS, description: '方向：收款 / 付款 / 内部转账' })
  direction!: 'in' | 'out' | 'transfer';

  @ApiProperty({ type: String, description: '发生日期', example: '2026-11-12' })
  occurredDate!: string;

  @ApiProperty({ type: String, description: '金额（正数，最多 2 位小数）', example: '1200.00' })
  amount!: string;

  @ApiProperty({ type: String, description: '资金账户 id' }) accountId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: '内部转账的转入账户 id' })
  toAccountId?: string | null;

  @ApiPropertyOptional({
    type: String,
    enum: CASH_CATEGORIES,
    nullable: true,
    description: '收支分类：收款 3 项 / 付款 5 项；内部转账为空',
  })
  category?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '客户 id（仅销售回款必填）' })
  customerId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '供应商 id（仅采购付款必填）' })
  supplierId?: string | null;

  @ApiPropertyOptional({ type: String, description: '备注（付款写对象与事由；承兑写票号 / 到期日）', default: '' })
  note?: string;
}

export class FinanceCashEntryDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, description: '流水编号（CF + 5 位流水）' }) code!: string;
  @ApiProperty({ type: String, enum: CASH_DIRECTIONS }) direction!: string;
  @ApiProperty({ type: String }) occurredDate!: string;
  @ApiProperty({ type: String }) amount!: string;
  @ApiProperty({ type: String }) accountId!: string;
  @ApiProperty({ type: String }) accountName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) toAccountId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) toAccountName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) customerId!: string | null;
  @ApiProperty({ type: String }) customerName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) supplierId!: string | null;
  @ApiProperty({ type: String }) supplierName!: string;
  @ApiProperty({ type: String, enum: CASH_METHODS }) method!: string;
  @ApiPropertyOptional({ type: String, enum: CASH_CATEGORIES, nullable: true })
  category!: string | null;
  @ApiProperty({ type: String }) note!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: '源单类型（sale_order / purchase_order）' })
  sourceType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: '源单 id' })
  sourceId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: '源单编号' })
  sourceCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: '来源显示名' })
  sourceLabel!: string | null;
  @ApiProperty({ type: Boolean, description: '是否可手工编辑 / 删除（源单流水为 false）' })
  editable!: boolean;
}

export class FinanceCashEntryListSummaryDto {
  @ApiProperty({ type: String, description: '筛选全量收款合计' }) receipts!: string;
  @ApiProperty({ type: String, description: '筛选全量付款合计' }) payments!: string;
  @ApiProperty({ type: String, description: '净额 = 收款 − 付款' }) net!: string;
}

export class FinanceCashEntryListDto {
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: () => FinanceCashEntryListSummaryDto, description: '筛选全量汇总（合计行）' })
  summary!: FinanceCashEntryListSummaryDto;
  @ApiProperty({ type: () => [FinanceCashEntryDto] }) items!: FinanceCashEntryDto[];
}

export class FinanceCashSummaryDto {
  @ApiProperty({ type: String, description: '期间收款合计' }) receipts!: string;
  @ApiProperty({ type: String, description: '期间付款合计' }) payments!: string;
  @ApiProperty({ type: String, description: '净流入 = 收款 − 付款' }) netFlow!: string;
  @ApiProperty({ type: String, description: '全部账户当前资金总额（含票据）' }) totalFunds!: string;
  @ApiProperty({ type: () => [FinanceAccountDto], description: '各账户当前余额' })
  accounts!: FinanceAccountDto[];
}

// ── 应收（客户欠款）─────────────────────────────────────

export class FinanceReceivableDto {
  @ApiProperty({ type: String }) customerId!: string;
  @ApiProperty({ type: String, description: '期初欠款（客户档案录入的上线前净欠款）' })
  openingDebt!: string;
  @ApiProperty({ type: String, description: '累计销售（现结取实收、赊销取合计）' }) sales!: string;
  @ApiProperty({ type: String, description: '累计收款（销售回款流水合计）' }) receipts!: string;
  @ApiProperty({ type: String, description: '欠款 = 期初欠款 + 销售 − 收款；负数为预收' })
  outstanding!: string;
}

export class FinanceReceivableListDto {
  @ApiProperty({ type: () => [FinanceReceivableDto] }) items!: FinanceReceivableDto[];
}

// ── 应付（供应商欠款）───────────────────────────────────

export class FinancePayableDto {
  @ApiProperty({ type: String }) supplierId!: string;
  @ApiProperty({ type: String, description: '期初应付（供应商档案录入的上线前净应付）' })
  openingPayable!: string;
  @ApiProperty({ type: String, description: '累计采购（现结取实付、赊购取合计）' }) purchases!: string;
  @ApiProperty({ type: String, description: '累计付款（采购付款流水合计）' }) payments!: string;
  @ApiProperty({ type: String, description: '应付 = 期初应付 + 采购 − 付款；负数为预付' })
  outstanding!: string;
}

export class FinancePayableListDto {
  @ApiProperty({ type: () => [FinancePayableDto] }) items!: FinancePayableDto[];
}
