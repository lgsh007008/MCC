import { ApiProperty } from '@nestjs/swagger';

// OpenAPI 契约的请求/响应形状（ADR-006：契约由装饰器代码生成）。
// 运行时校验以 @mcc/shared 的 zod schema 为准（ZodValidationPipe），本文件只承载契约形状。

// ── 经营收支汇总（R-财务-001）────────────────────────────

export class FinanceCategorySubtotalDto {
  @ApiProperty({
    type: String,
    enum: ['sales_revenue', 'other_revenue', 'purchase_expense', 'labor_cost', 'operating_expense'],
    description: '经营收支项（固定五项输出）',
  })
  category!: string;

  @ApiProperty({ type: String, description: '金额（正数，无数据为 0.00）' })
  amount!: string;
}

export class FinanceSummaryDto {
  @ApiProperty({ type: String, description: '总收入 = 销售收入 + 其他收入' })
  totalIncome!: string;
  @ApiProperty({ type: String, description: '总支出 = 采购付款 + 工资 + 费用' })
  totalExpense!: string;
  @ApiProperty({ type: String, description: '净额 = 总收入 − 总支出' })
  netAmount!: string;
  @ApiProperty({ type: Number, description: '期间销售单数' })
  orderCount!: number;
  @ApiProperty({ type: Number, description: '期间采购单数' })
  purchaseCount!: number;
  @ApiProperty({ type: Number, description: '计入经营收支的流水条数' })
  cashEntryCount!: number;
  @ApiProperty({ type: () => [FinanceCategorySubtotalDto], description: '分类小计（五项固定输出）' })
  categories!: FinanceCategorySubtotalDto[];
}
