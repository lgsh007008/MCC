import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 库存 / 期初 / 盘点契约形状（design/生产与库存.md §5）。

export class InventoryPoolDto {
  @ApiProperty({ type: String, description: '数量：原木吨数 / 方木方数' })
  quantity!: string;

  @ApiProperty({ type: String, description: '平均成本：元/吨 或 元/m³（6 位）' })
  unitCost!: string;

  @ApiProperty({ type: String, description: '库存金额' })
  amount!: string;

  @ApiProperty({ type: Boolean, description: '是否为负库存' })
  negative!: boolean;
}

export class InventoryTimberLineDto {
  @ApiProperty({ type: String })
  productType!: string;

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

  @ApiProperty({ type: Boolean })
  negative!: boolean;
}

export class InventorySummaryDto {
  @ApiProperty({ type: Boolean, description: '是否尚未设置期初库存' })
  needsOpening!: boolean;

  @ApiProperty({ type: String, nullable: true, description: '期初日期' })
  openingDate!: string | null;

  @ApiProperty({ type: InventoryPoolDto })
  raw!: InventoryPoolDto;

  @ApiProperty({ type: InventoryPoolDto })
  timber!: InventoryPoolDto;

  @ApiProperty({ type: () => [InventoryTimberLineDto] })
  timberLines!: InventoryTimberLineDto[];

  @ApiProperty({ type: String })
  totalAmount!: string;

  @ApiProperty({ type: String, description: '待结转成本（不计入库存总值）' })
  pendingAmount!: string;

  @ApiProperty({ type: Number, description: '待结转的领用单笔数' })
  pendingIssueCount!: number;

  @ApiProperty({ type: String, nullable: true, description: '最早一笔待结转领用单编号' })
  earliestPendingIssueCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: '最早一笔待结转领用单日期' })
  earliestPendingIssueDate!: string | null;

  @ApiProperty({ type: Number })
  negativeLineCount!: number;
}

export class InventoryOpeningRawBodyDto {
  @ApiProperty({ type: String, description: '期初原木吨数（4 位以内小数）' })
  quantity!: string;

  @ApiPropertyOptional({ type: String, description: '单位成本（元/吨，6 位以内小数）；与金额二选一' })
  unitCost?: string;

  @ApiPropertyOptional({ type: String, description: '期初金额（元，2 位小数）；与单位成本二选一' })
  amount?: string;
}

export class InventoryOpeningTimberBodyDto {
  @ApiProperty({ type: Number })
  lengthMm!: number;

  @ApiProperty({ type: Number })
  widthMm!: number;

  @ApiProperty({ type: Number })
  heightMm!: number;

  @ApiProperty({ type: String, description: '期初方木方数' })
  quantity!: string;

  @ApiPropertyOptional({ type: String, description: '单位成本（元/m³）' })
  unitCost?: string;

  @ApiPropertyOptional({ type: String, description: '期初金额（元）' })
  amount?: string;
}

export class InventoryOpeningBodyDto {
  @ApiProperty({ type: String, description: '期初日期' })
  openingDate!: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;

  @ApiProperty({ type: InventoryOpeningRawBodyDto })
  rawLog!: InventoryOpeningRawBodyDto;

  @ApiProperty({ type: () => [InventoryOpeningTimberBodyDto] })
  timber!: InventoryOpeningTimberBodyDto[];
}

export class InventoryCountRawBodyDto {
  @ApiPropertyOptional({ type: String, description: '原木实盘吨数；留空表示本行不参与本次盘点' })
  actualQuantity?: string;

  @ApiPropertyOptional({
    type: String,
    enum: ['measurement', 'missing', 'damage', 'other'],
    description: '差异原因；选填，留空按 other 落库',
  })
  reason?: string;
}

export class InventoryCountTimberBodyDto {
  @ApiProperty({ type: Number })
  lengthMm!: number;

  @ApiProperty({ type: Number })
  widthMm!: number;

  @ApiProperty({ type: Number })
  heightMm!: number;

  @ApiPropertyOptional({ type: String, description: '方木实盘方数；留空表示本行不参与本次盘点' })
  actualQuantity?: string;

  @ApiPropertyOptional({
    type: String,
    enum: ['measurement', 'missing', 'damage', 'other'],
    description: '差异原因；选填，留空按 other 落库',
  })
  reason?: string;
}

export class InventoryCountBodyDto {
  @ApiProperty({
    type: String,
    enum: ['raw_log', 'timber'],
    description: '盘点类型：一张单只盘一类库存',
  })
  targetType!: 'raw_log' | 'timber';

  @ApiProperty({ type: String, description: '盘点日期；不早于期初日期、不晚于今天' })
  countDate!: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;

  @ApiPropertyOptional({
    type: InventoryCountRawBodyDto,
    description: '原木盘点行（targetType = raw_log 时必填）',
  })
  rawLog?: InventoryCountRawBodyDto;

  @ApiPropertyOptional({
    type: () => [InventoryCountTimberBodyDto],
    description: '方木盘点行（targetType = timber 时使用）',
  })
  timber?: InventoryCountTimberBodyDto[];
}

export class InventoryAdjustmentResultDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, description: 'IC 编号' })
  code!: string;

  @ApiProperty({ type: String, enum: ['opening', 'count'] })
  type!: 'opening' | 'count';

  @ApiProperty({ type: String, description: '调整日期' })
  adjustmentDate!: string;
}

export class InventoryAdjustmentItemDto {
  @ApiProperty({ type: String, enum: ['raw_log', 'timber'] })
  targetType!: 'raw_log' | 'timber';

  @ApiProperty({ type: Number, nullable: true })
  lengthMm!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  widthMm!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  heightMm!: number | null;

  @ApiProperty({ type: String })
  bookQuantity!: string;

  @ApiProperty({ type: String })
  actualQuantity!: string;

  @ApiProperty({ type: String })
  differenceQuantity!: string;

  @ApiProperty({ type: String })
  unitCost!: string;

  @ApiProperty({ type: String })
  amount!: string;

  @ApiProperty({
    type: String,
    enum: ['opening', 'measurement', 'missing', 'damage', 'other'],
    description: '差异原因；盘点未填时按 other 落库',
  })
  reason!: string;

  @ApiProperty({ type: String })
  note!: string;
}

export class InventoryOpeningDetailDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  openingDate!: string;

  @ApiProperty({ type: String, description: '操作人；存量数据为空时显示「—」' })
  operatorName!: string;

  @ApiProperty({ type: String })
  note!: string;

  @ApiProperty({ type: String })
  createdAt!: string;

  @ApiProperty({ type: String })
  totalAmount!: string;

  @ApiProperty({ type: () => [InventoryAdjustmentItemDto] })
  items!: InventoryAdjustmentItemDto[];
}

export class InventoryCountListItemDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String, enum: ['raw_log', 'timber'], description: '盘点类型' })
  targetType!: 'raw_log' | 'timber';

  @ApiProperty({ type: String })
  adjustmentDate!: string;

  @ApiProperty({ type: String })
  operatorName!: string;

  @ApiProperty({ type: Number })
  gainCount!: number;

  @ApiProperty({ type: Number })
  lossCount!: number;

  @ApiProperty({ type: String, description: '原木差异吨数' })
  rawDifferenceTons!: string;

  @ApiProperty({ type: String, description: '方木差异方数' })
  timberDifferenceVolume!: string;

  @ApiProperty({ type: String, description: '差异金额合计（盘盈为正、盘亏为负）' })
  differenceAmount!: string;

  @ApiProperty({ type: String })
  note!: string;

  @ApiProperty({ type: String })
  createdAt!: string;
}

export class InventoryCountListDto {
  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: () => [InventoryCountListItemDto] })
  items!: InventoryCountListItemDto[];
}

export class InventoryCountDetailDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String, enum: ['raw_log', 'timber'], description: '盘点类型' })
  targetType!: 'raw_log' | 'timber';

  @ApiProperty({ type: String })
  adjustmentDate!: string;

  @ApiProperty({ type: String })
  operatorName!: string;

  @ApiProperty({ type: String })
  note!: string;

  @ApiProperty({ type: String })
  createdAt!: string;

  @ApiProperty({ type: () => [InventoryAdjustmentItemDto] })
  items!: InventoryAdjustmentItemDto[];
}
