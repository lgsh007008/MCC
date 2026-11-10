import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// OpenAPI 契约的请求/响应形状（ADR-006：契约由装饰器代码生成）。
// 运行时校验以 @mcc/shared 的 zod schema 为准（ZodValidationPipe），本文件只承载契约形状。

// ── 请求体 ──────────────────────────────────────────────

export class FinanceEventBodyDto {
  @ApiProperty({
    type: String,
    enum: ['other_revenue', 'other_expense'],
    description: '分类：手工记账仅允许 other_revenue（其他收入）/ other_expense（其他支出）',
  })
  category!: 'other_revenue' | 'other_expense';

  @ApiProperty({ type: String, description: '发生日期', example: '2026-11-10' })
  occurredDate!: string;

  @ApiProperty({ type: String, description: '金额（按正数提交、最多 2 位小数；符号由分类决定）', example: '350.25' })
  amount!: string;

  @ApiPropertyOptional({ type: String, description: '备注（具体事由）', default: '' })
  note?: string;
}

export class FinanceEventUpdateBodyDto extends FinanceEventBodyDto {}

export class FinanceEventBatchDeleteBodyDto {
  @ApiProperty({ type: [String], description: '要删除的事件 id 列表（1~200，仅手工事件）' })
  ids!: string[];
}

// ── 响应体 ──────────────────────────────────────────────

export class FinanceEventListItemDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, description: '事件编号（年月+当月流水）' }) code!: string;
  @ApiProperty({ type: String, description: '发生日期' }) occurredDate!: string;
  @ApiProperty({
    type: String,
    enum: ['sales_revenue', 'other_revenue', 'purchase_cost', 'labor_cost', 'other_expense'],
    description: '分类',
  })
  category!: 'sales_revenue' | 'other_revenue' | 'purchase_cost' | 'labor_cost' | 'other_expense';
  @ApiProperty({ type: String, description: '金额（有符号：收入正、支出负）' }) amount!: string;
  @ApiProperty({ type: String }) note!: string;
  @ApiProperty({ type: String, enum: ['auto', 'manual'], description: '来源：自动 / 手工' })
  source!: 'auto' | 'manual';
  @ApiPropertyOptional({ type: String, nullable: true, description: '源单类型（如 sale_order）' })
  sourceType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: '源单 id' })
  sourceId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, description: '源单编号' })
  sourceCode!: string | null;
}

export class FinanceEventDto extends FinanceEventListItemDto {}

export class FinanceEventSummaryDto {
  @ApiProperty({ type: String, description: '金额合计（有符号，筛选全量）' })
  amount!: string;
}

export class FinanceEventListDto {
  @ApiProperty({ type: Number, description: '总数' }) total!: number;
  @ApiProperty({ type: () => FinanceEventSummaryDto, description: '筛选全量汇总（合计行）' })
  summary!: FinanceEventSummaryDto;
  @ApiProperty({ type: () => [FinanceEventListItemDto] }) items!: FinanceEventListItemDto[];
}

export class FinanceEventBatchDeleteResponseDto {
  @ApiProperty({ type: Number, description: '实际删除（软删除）条数' })
  deleted!: number;
}

export class FinanceCategorySubtotalDto {
  @ApiProperty({
    type: String,
    enum: ['sales_revenue', 'other_revenue', 'purchase_cost', 'labor_cost', 'other_expense'],
  })
  category!: string;

  @ApiProperty({ type: String, description: '收入小计' }) income!: string;
  @ApiProperty({ type: String, description: '成本小计（绝对值）' }) cost!: string;
  @ApiProperty({ type: String, description: '净额（收入 − 成本）' }) net!: string;
}

export class FinanceSummaryDto {
  @ApiProperty({ type: String, description: '总收入' }) totalIncome!: string;
  @ApiProperty({ type: String, description: '总成本（绝对值）' }) totalCost!: string;
  @ApiProperty({ type: String, description: '净利润 = 总收入 − 总成本' }) netProfit!: string;
  @ApiProperty({ type: Number, description: '事件条数' }) eventCount!: number;
  @ApiProperty({ type: () => [FinanceCategorySubtotalDto], description: '分类小计（五类固定输出）' })
  categories!: FinanceCategorySubtotalDto[];
}
