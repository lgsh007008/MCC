import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// OpenAPI 契约的请求/响应形状（ADR-006：契约由装饰器代码生成）。
// 运行时校验以 @mcc/shared 的 zod schema 为准（ZodValidationPipe），本文件只承载契约形状。
// 注意：属性须显式标注 type（开发运行时 tsx 不产出 design:type 元数据）。

// ── 请求体 ──────────────────────────────────────────────

export class SaleOrderItemBodyDto {
  @ApiProperty({ type: String, enum: ['board', 'other'], description: '产品类型：board 板材 / other 其他' })
  productType!: 'board' | 'other';

  @ApiPropertyOptional({ type: String, description: '厚度（cm，3 位小数），板材必填', example: '2.000' })
  thicknessCm?: string;

  @ApiPropertyOptional({ type: String, description: '宽度（cm，3 位小数），板材必填', example: '80.000' })
  widthCm?: string;

  @ApiPropertyOptional({ type: String, description: '长度（cm，3 位小数），板材必填', example: '300.000' })
  lengthCm?: string;

  @ApiPropertyOptional({ type: Number, description: '根数（整数），板材必填', example: 3 })
  pieces?: number;

  @ApiPropertyOptional({ type: String, description: '单价（元/m³，2 位小数），板材必填', example: '550.25' })
  price?: string;

  @ApiPropertyOptional({ type: String, description: '行金额（其他类型手填，2 位小数）', example: '50.00' })
  lineAmount?: string;

  @ApiPropertyOptional({ type: String, description: '行其他金额（两类型通用兜底），默认 0', default: '0' })
  otherAmount?: string;

  @ApiPropertyOptional({ type: String, description: '行备注', default: '' })
  note?: string;
}

export class SaleOrderItemUpdateBodyDto extends SaleOrderItemBodyDto {
  @ApiPropertyOptional({ type: String, description: '已有明细行 id（编辑时携带，新建行为空）' })
  id?: string;
}

export class SaleOrderBodyDto {
  @ApiProperty({ type: String, description: '销售日期', example: '2026-11-09' })
  saleDate!: string;

  @ApiProperty({ type: String, description: '客户名称（文本）', example: '张三木材店' })
  customerName!: string;

  @ApiPropertyOptional({ type: String, description: '主表其他金额（运费等），默认 0', default: '0' })
  otherAmount?: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;

  @ApiProperty({ type: () => [SaleOrderItemBodyDto], description: '明细行（至少一行）' })
  items!: SaleOrderItemBodyDto[];
}

export class SaleOrderUpdateBodyDto {
  @ApiProperty({ type: String, description: '销售日期', example: '2026-11-09' })
  saleDate!: string;

  @ApiProperty({ type: String, description: '客户名称（文本）', example: '张三木材店' })
  customerName!: string;

  @ApiPropertyOptional({ type: String, description: '主表其他金额（运费等），默认 0', default: '0' })
  otherAmount?: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;

  @ApiProperty({ type: () => [SaleOrderItemUpdateBodyDto], description: '明细行（至少一行；已有行带 id）' })
  items!: SaleOrderItemUpdateBodyDto[];
}

// ── 响应体 ──────────────────────────────────────────────

export class SaleOrderItemResponseDto {
  @ApiProperty({ type: String, description: '明细行 id' })
  id!: string;

  @ApiProperty({ type: Number, description: '行序' })
  seq!: number;

  @ApiProperty({ type: String, description: '销售明细编码 = 主单编号-行序' })
  code!: string;

  @ApiProperty({ type: String, description: '产品类型' })
  productType!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: '厚度（cm）' })
  thicknessCm!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '宽度（cm）' })
  widthCm!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '长度（cm）' })
  lengthCm!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: '根数' })
  pieces!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '方量（m³）' })
  volumeM3!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '单价（元/m³）' })
  price!: string | null;

  @ApiProperty({ type: String, description: '行小计金额' })
  lineAmount!: string;

  @ApiProperty({ type: String, description: '行其他金额' })
  otherAmount!: string;

  @ApiProperty({ type: String, description: '行备注' })
  note!: string;
}

export class SaleOrderListItemDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, description: '销售单编号' }) code!: string;
  @ApiProperty({ type: String }) saleDate!: string;
  @ApiProperty({ type: String }) customerName!: string;
  @ApiProperty({ type: String }) totalVolume!: string;
  @ApiProperty({ type: String }) subtotalAmount!: string;
  @ApiProperty({ type: String }) otherAmount!: string;
  @ApiProperty({ type: String }) totalAmount!: string;
  @ApiProperty({ type: String }) note!: string;
}

export class SaleOrderDto extends SaleOrderListItemDto {
  @ApiProperty({ type: () => [SaleOrderItemResponseDto], description: '明细行' })
  items!: SaleOrderItemResponseDto[];
}

export class SaleOrderSummaryDto {
  @ApiProperty({ type: String, description: '合计方量（筛选全量）' })
  totalVolume!: string;

  @ApiProperty({ type: String, description: '小计金额合计（筛选全量）' })
  subtotalAmount!: string;

  @ApiProperty({ type: String, description: '其他金额合计（筛选全量）' })
  otherAmount!: string;

  @ApiProperty({ type: String, description: '合计金额合计（筛选全量）' })
  totalAmount!: string;
}

export class SaleOrderListDto {
  @ApiProperty({ type: Number, description: '总数' })
  total!: number;

  @ApiProperty({ type: () => SaleOrderSummaryDto, description: '筛选全量汇总（合计行）' })
  summary!: SaleOrderSummaryDto;

  @ApiProperty({ type: () => [SaleOrderListItemDto] })
  items!: SaleOrderListItemDto[];
}

export class SaleOrderBatchDeleteBodyDto {
  @ApiProperty({ type: [String], description: '要删除的销售单 id 列表（1~200）' })
  ids!: string[];
}

export class SaleOrderBatchDeleteResponseDto {
  @ApiProperty({ type: Number, description: '实际删除（软删除）条数' })
  deleted!: number;
}