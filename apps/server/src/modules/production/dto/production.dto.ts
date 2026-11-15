import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 生产与库存契约形状（design/生产与库存.md §5）；运行时校验以 @mcc/shared 的 zod schema 为准。
// 原木领用（MI）与方木产出（PR）是两张独立单据。

// ── 原木领用 ──────────────────────────────────────────

export class MaterialIssueBodyDto {
  @ApiProperty({ type: String, description: '领用日期', example: '2026-11-15' })
  issueDate!: string;

  @ApiProperty({ type: String, description: '领用原木吨数（3 位小数）', example: '5.000' })
  tons!: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;
}

export class MaterialIssueBatchDeleteBodyDto {
  @ApiProperty({ type: [String], description: '原木领用单 id 列表（1~200）' })
  ids!: string[];
}

export class MaterialIssueBatchDeleteResponseDto {
  @ApiProperty({ type: Number, description: '实际删除条数' })
  deleted!: number;
}

export class MaterialIssueDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, description: '编号 MI-#####' })
  code!: string;

  @ApiProperty({ type: String, description: '领用日期' })
  issueDate!: string;

  @ApiProperty({ type: String, description: '领用原木吨数（3 位小数）' })
  tons!: string;

  @ApiProperty({ type: String })
  note!: string;

  @ApiProperty({ type: String, description: '结转状态：pending 待结转 / settled 已结转' })
  settlementStatus!: string;

  @ApiProperty({ type: String, description: '已结转金额（2 位小数）' })
  settledAmount!: string;

  @ApiProperty({ type: String, description: '待结转金额（2 位小数）' })
  pendingAmount!: string;

  @ApiProperty({ type: [String], description: '结转过本单的产出单编号（按事件顺序）' })
  settledByCodes!: string[];

  @ApiProperty({ type: String })
  createdAt!: string;
}

export class MaterialIssueSummaryDto {
  @ApiProperty({ type: String, description: '领用吨数合计（3 位小数）' })
  tons!: string;
}

export class MaterialIssueListDto {
  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: MaterialIssueSummaryDto })
  summary!: MaterialIssueSummaryDto;

  @ApiProperty({ type: () => [MaterialIssueDto] })
  items!: MaterialIssueDto[];
}

// ── 方木产出 ──────────────────────────────────────────

export class ProductionOutputLineBodyDto {
  @ApiProperty({ type: Number, description: '长度（净尺寸，整数毫米）', example: 3000 })
  lengthMm!: number;

  @ApiProperty({ type: Number, description: '宽度（净尺寸，整数毫米）', example: 100 })
  widthMm!: number;

  @ApiProperty({ type: Number, description: '高度（净尺寸，整数毫米）', example: 20 })
  heightMm!: number;

  @ApiProperty({ type: Number, description: '根数（正整数）', example: 10 })
  pieces!: number;

  @ApiPropertyOptional({ type: String, description: '行备注', default: '' })
  note?: string;
}

export class ProductionOutputLineUpdateBodyDto extends ProductionOutputLineBodyDto {
  @ApiPropertyOptional({ type: String, description: '已有产出行 id（编辑时携带）' })
  id?: string;
}

export class ProductionOutputBodyDto {
  @ApiProperty({ type: String, description: '产出日期', example: '2026-11-15' })
  outputDate!: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;

  @ApiProperty({ type: () => [ProductionOutputLineBodyDto], description: '产出明细（至少一行）' })
  outputs!: ProductionOutputLineBodyDto[];
}

export class ProductionOutputUpdateBodyDto {
  @ApiProperty({ type: String, description: '产出日期', example: '2026-11-15' })
  outputDate!: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;

  @ApiProperty({
    type: () => [ProductionOutputLineUpdateBodyDto],
    description: '产出明细（至少一行；已有行带 id）',
  })
  outputs!: ProductionOutputLineUpdateBodyDto[];
}

export class ProductionOutputBatchDeleteBodyDto {
  @ApiProperty({ type: [String], description: '方木产出单 id 列表（1~200）' })
  ids!: string[];
}

export class ProductionOutputBatchDeleteResponseDto {
  @ApiProperty({ type: Number, description: '实际删除条数' })
  deleted!: number;
}

export class ProductionOutputLineDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: Number })
  seq!: number;

  @ApiProperty({ type: Number })
  lengthMm!: number;

  @ApiProperty({ type: Number })
  widthMm!: number;

  @ApiProperty({ type: Number })
  heightMm!: number;

  @ApiProperty({ type: Number })
  pieces!: number;

  @ApiProperty({ type: String, description: '方量（m³，4 位小数）' })
  volumeM3!: string;

  @ApiProperty({ type: String })
  note!: string;
}

export class ProductionOutputListItemDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, description: '编号 PR-#####' })
  code!: string;

  @ApiProperty({ type: String, description: '产出日期' })
  outputDate!: string;

  @ApiProperty({ type: Number, description: '产出明细行数' })
  lineCount!: number;

  @ApiProperty({ type: String, description: '产出总方数（4 位小数）' })
  totalVolume!: string;

  @ApiProperty({ type: String, description: '本次结转金额（2 位小数）' })
  settledAmount!: string;

  @ApiProperty({ type: String })
  note!: string;

  @ApiProperty({ type: String })
  createdAt!: string;
}

export class ProductionOutputDto extends ProductionOutputListItemDto {
  @ApiProperty({ type: [String], description: '来源领用单编号（按最早未结转先结转推导）' })
  sourceIssueCodes!: string[];

  @ApiProperty({ type: () => [ProductionOutputLineDto] })
  outputs!: ProductionOutputLineDto[];
}

export class ProductionOutputSummaryDto {
  @ApiProperty({ type: String, description: '产出总方数（4 位小数）' })
  totalVolume!: string;
}

export class ProductionOutputListDto {
  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: ProductionOutputSummaryDto })
  summary!: ProductionOutputSummaryDto;

  @ApiProperty({ type: () => [ProductionOutputListItemDto] })
  items!: ProductionOutputListItemDto[];
}
