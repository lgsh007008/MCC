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

  @ApiProperty({ type: String, description: '所属生产批次 id' })
  batchId!: string;
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

  @ApiProperty({ type: String, description: '所属生产批次 id' })
  batchId!: string;

  @ApiProperty({ type: String, description: '所属生产批次编号 BT-#####' })
  batchCode!: string;

  @ApiProperty({ type: String, description: '批次状态：open 进行中 / closed 已关闭' })
  batchStatus!: string;

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

  @ApiProperty({ type: String, description: '所属生产批次 id（须为进行中批次）' })
  batchId!: string;

  @ApiProperty({ type: () => [ProductionOutputLineBodyDto], description: '产出明细（至少一行）' })
  outputs!: ProductionOutputLineBodyDto[];
}

export class ProductionOutputUpdateBodyDto {
  @ApiProperty({ type: String, description: '产出日期', example: '2026-11-15' })
  outputDate!: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;

  @ApiProperty({ type: String, description: '所属生产批次 id（须为进行中批次）' })
  batchId!: string;

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

  @ApiProperty({ type: String, description: '所属生产批次 id' })
  batchId!: string;

  @ApiProperty({ type: String, description: '所属生产批次编号 BT-#####' })
  batchCode!: string;

  @ApiProperty({ type: String, description: '批次状态：open 进行中 / closed 已关闭' })
  batchStatus!: string;

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

// ── 生产批次 ──────────────────────────────────────────

export class ProductionBatchBodyDto {
  @ApiProperty({ type: String, description: '批次日期', example: '2026-11-15' })
  batchDate!: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;
}

export class ProductionBatchDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, description: '批次编号 BT-#####' })
  code!: string;

  @ApiProperty({ type: String, description: '批次日期' })
  batchDate!: string;

  @ApiProperty({ type: String, enum: ['open', 'closed'] })
  status!: 'open' | 'closed';

  @ApiProperty({ type: String, enum: ['opening', 'production'] })
  kind!: 'opening' | 'production';

  @ApiProperty({ type: String })
  note!: string;

  @ApiProperty({ type: String, nullable: true })
  closedAt!: string | null;

  @ApiProperty({ type: String })
  createdAt!: string;

  @ApiProperty({ type: String, description: '批次方木数量（m³，4 位小数）' })
  timberVolume!: string;

  @ApiProperty({ type: String, description: '批次方木金额（2 位小数）' })
  timberAmount!: string;

  @ApiProperty({ type: String, description: '批次方木成本（元/m³，6 位小数）' })
  timberUnitCost!: string;

  @ApiProperty({ type: String, description: '批次待结转金额（2 位小数）' })
  pendingAmount!: string;

  @ApiProperty({ type: String, description: '关闭时一次性结转金额（2 位小数）' })
  closedSettledAmount!: string;

  @ApiProperty({ type: Number, description: '领用单数' })
  issueCount!: number;

  @ApiProperty({ type: Number, description: '产出单数' })
  outputCount!: number;
}

export class ProductionBatchListDto {
  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: () => [ProductionBatchDto] })
  items!: ProductionBatchDto[];
}

export class ProductionBatchBatchCloseBodyDto {
  @ApiProperty({ type: [String], description: '生产批次 id 列表（1~200）' })
  ids!: string[];
}

export class ProductionBatchBatchCloseResponseDto {
  @ApiProperty({ type: Number, description: '实际关闭条数' })
  closed!: number;

  @ApiProperty({ type: Number, description: '跳过条数（已关闭 / 不存在）' })
  skipped!: number;
}

export class ProductionBatchIssueDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  issueDate!: string;

  @ApiProperty({ type: String })
  tons!: string;

  @ApiProperty({ type: String })
  settledAmount!: string;

  @ApiProperty({ type: String })
  pendingAmount!: string;
}

export class ProductionBatchOutputDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  outputDate!: string;

  @ApiProperty({ type: String })
  totalVolume!: string;

  @ApiProperty({ type: String })
  settledAmount!: string;
}

export class ProductionBatchTimberLineDto {
  @ApiProperty({ type: Number })
  lengthMm!: number;

  @ApiProperty({ type: Number })
  widthMm!: number;

  @ApiProperty({ type: Number })
  heightMm!: number;

  @ApiProperty({ type: String })
  quantity!: string;

  @ApiProperty({ type: String })
  unitCost!: string;

  @ApiProperty({ type: String })
  amount!: string;
}

export class ProductionBatchDetailDto extends ProductionBatchDto {
  @ApiProperty({ type: () => [ProductionBatchIssueDto] })
  issues!: ProductionBatchIssueDto[];

  @ApiProperty({ type: () => [ProductionBatchOutputDto] })
  outputs!: ProductionBatchOutputDto[];

  @ApiProperty({ type: () => [ProductionBatchTimberLineDto] })
  timberLines!: ProductionBatchTimberLineDto[];
}
