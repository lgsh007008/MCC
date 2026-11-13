import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// OpenAPI 契约的请求/响应形状（ADR-006：契约由装饰器代码生成）。
// 运行时校验以 @mcc/shared 的 zod schema 为准（ZodValidationPipe），本文件只承载契约形状。
// 注意：属性须显式标注 type（开发运行时 tsx 不产出 design:type 元数据）。

// ── 请求体 ──────────────────────────────────────────────

export class SaleOrderItemBodyDto {
  @ApiProperty({ type: Number, description: '长度（整数毫米）', example: 3000 })
  lengthMm!: number;

  @ApiProperty({ type: Number, description: '宽度（整数毫米）', example: 100 })
  widthMm!: number;

  @ApiProperty({ type: Number, description: '高度（整数毫米，即原厚度）', example: 20 })
  heightMm!: number;

  @ApiProperty({ type: Number, description: '根数（正整数）', example: 10 })
  pieces!: number;

  @ApiProperty({
    type: String,
    enum: ['volume', 'piece'],
    description: '计价方式：volume 按方量（默认）/ piece 按根数',
    default: 'volume',
  })
  pricingMode?: 'volume' | 'piece';

  @ApiProperty({
    type: String,
    description: '单价（2 位小数）：按方量为元/m³，按根数为元/根',
    example: '600.00',
  })
  price!: string;

  @ApiPropertyOptional({ type: String, description: '行其他金额（行级人工调整），默认 0', default: '0' })
  otherAmount?: string;

  @ApiPropertyOptional({ type: String, description: '行备注（产品描述）', default: '' })
  note?: string;
}

export class SaleOrderItemUpdateBodyDto extends SaleOrderItemBodyDto {
  @ApiPropertyOptional({ type: String, description: '已有明细行 id（编辑时携带，新建行为空）' })
  id?: string;
}

export class SaleOrderBodyDto {
  @ApiProperty({ type: String, description: '销售日期', example: '2026-11-09' })
  saleDate!: string;

  @ApiProperty({ type: String, description: '客户 id（客户档案外键，须为启用态）' })
  customerId!: string;

  @ApiPropertyOptional({ type: String, description: '主表其他金额（运费等），默认 0', default: '0' })
  otherAmount?: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;

  @ApiPropertyOptional({ type: String, enum: ['credit', 'settled'], description: '结算方式：赊销（默认）/ 现结', default: 'credit' })
  settlementMode?: 'credit' | 'settled';

  @ApiPropertyOptional({ type: String, nullable: true, description: '现结收款账户 id（现结必填）' })
  settleAccountId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '实收金额（现结默认等于合计，可抹零 / 约整）' })
  receivedAmount?: string | null;

  @ApiProperty({ type: () => [SaleOrderItemBodyDto], description: '明细行（至少一行）' })
  items!: SaleOrderItemBodyDto[];
}

export class SaleOrderUpdateBodyDto {
  @ApiProperty({ type: String, description: '销售日期', example: '2026-11-09' })
  saleDate!: string;

  @ApiProperty({ type: String, description: '客户 id（客户档案外键；未变更时不校验启用态）' })
  customerId!: string;

  @ApiPropertyOptional({ type: String, description: '主表其他金额（运费等），默认 0', default: '0' })
  otherAmount?: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;

  @ApiPropertyOptional({ type: String, enum: ['credit', 'settled'], description: '结算方式：赊销（默认）/ 现结', default: 'credit' })
  settlementMode?: 'credit' | 'settled';

  @ApiPropertyOptional({ type: String, nullable: true, description: '现结收款账户 id（现结必填）' })
  settleAccountId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '实收金额（现结默认等于合计）' })
  receivedAmount?: string | null;

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

  @ApiProperty({ type: String, enum: ['square_timber'], description: '产品类型（当前固定方木，服务端写入）' })
  productType!: 'square_timber';

  @ApiProperty({ type: String, enum: ['volume', 'piece'], description: '计价方式：volume 按方量 / piece 按根数' })
  pricingMode!: 'volume' | 'piece';

  @ApiProperty({ type: Number, description: '长度（整数毫米）' })
  lengthMm!: number;

  @ApiProperty({ type: Number, description: '宽度（整数毫米）' })
  widthMm!: number;

  @ApiProperty({ type: Number, description: '高度（整数毫米，即原厚度）' })
  heightMm!: number;

  @ApiProperty({ type: Number, description: '根数' })
  pieces!: number;

  @ApiProperty({ type: String, description: '方量（m³，4 位小数；所有行都计算）' })
  volumeM3!: string;

  @ApiProperty({ type: String, description: '单价（按方量为元/m³，按根数为元/根）' })
  price!: string;

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
  @ApiProperty({ type: String, description: '客户 id' }) customerId!: string;
  @ApiProperty({ type: String, description: '客户名称快照（下单当时）' }) customerName!: string;
  @ApiProperty({ type: String }) totalVolume!: string;
  @ApiProperty({ type: String }) subtotalAmount!: string;
  @ApiProperty({ type: String }) otherAmount!: string;
  @ApiProperty({ type: String }) totalAmount!: string;
  @ApiProperty({ type: String }) note!: string;
  @ApiProperty({ type: String, enum: ['credit', 'settled'], description: '结算方式' })
  settlementMode!: 'credit' | 'settled';
  @ApiProperty({ type: String, description: '实收金额（赊销为 0）' }) receivedAmount!: string;
  @ApiPropertyOptional({ type: String, nullable: true, description: '现结收款账户 id' })
  settleAccountId!: string | null;
}

export class SaleOrderDto extends SaleOrderListItemDto {
  @ApiPropertyOptional({ type: String, nullable: true, description: '客户编号（取自客户档案当前记录）' })
  customerCode!: string | null;

  @ApiProperty({ type: Boolean, description: '客户档案是否已删除（历史单据仍可读）' })
  customerDeleted!: boolean;

  @ApiProperty({ type: () => [SaleOrderItemResponseDto], description: '明细行' })
  items!: SaleOrderItemResponseDto[];
}

export class SaleOrderPrintEventDto {
  @ApiProperty({ type: String, description: '销售单 id' })
  id!: string;

  @ApiProperty({ type: String, description: '销售单编号快照' })
  code!: string;
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

export class CustomerVolumeSummaryItemDto {
  @ApiProperty({ type: String, description: '客户 id' })
  customerId!: string;

  @ApiProperty({ type: String, description: '累计下单方量（未软删销售单的合计方量，4 位小数）' })
  totalVolume!: string;

  @ApiProperty({ type: Number, description: '销售单数量（未软删）' })
  orderCount!: number;
}

export class CustomerVolumeSummaryDto {
  @ApiProperty({ type: () => [CustomerVolumeSummaryItemDto], description: '按请求的客户 id 顺序返回' })
  items!: CustomerVolumeSummaryItemDto[];
}