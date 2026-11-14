import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 采购单 OpenAPI 契约形状（ADR-006：契约由装饰器代码生成）。
// 运行时校验以 @mcc/shared 的 zod schema 为准（ZodValidationPipe）。

export class PurchaseOrderBodyDto {
  @ApiProperty({ type: String, description: '供应商 id（须启用）' })
  supplierId!: string;

  @ApiProperty({ type: String, description: '采购日期', example: '2026-11-14' })
  purchaseDate!: string;

  @ApiProperty({ type: String, description: '送货吨数（实际过磅，最多 3 位小数）', example: '1.500' })
  deliveredTons!: string;

  @ApiProperty({ type: String, description: '结算吨数（计价，最多 3 位小数）', example: '1.000' })
  settledTons!: string;

  @ApiProperty({ type: String, description: '单价（元/吨，非负、2 位小数）', example: '680.00' })
  unitPrice!: string;

  @ApiPropertyOptional({ type: String, description: '其他金额（运费等，非负）', default: '0.00' })
  otherAmount?: string;

  @ApiPropertyOptional({ type: String, enum: ['credit', 'settled'], description: '结算方式：赊购 / 现结', default: 'credit' })
  settlementMode?: 'credit' | 'settled';

  @ApiPropertyOptional({ type: String, nullable: true, description: '现结付款账户 id（现结必填）' })
  settleAccountId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '实付金额（现结默认等于合计、可改）' })
  paidAmount?: string | null;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;
}

export class PurchaseOrderDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, description: '采购单编号（PO + 5 位流水）' }) code!: string;
  @ApiProperty({ type: String }) purchaseDate!: string;
  @ApiProperty({ type: String }) supplierId!: string;
  @ApiProperty({ type: String }) supplierName!: string;
  @ApiProperty({ type: String }) deliveredTons!: string;
  @ApiProperty({ type: String }) settledTons!: string;
  @ApiProperty({ type: String }) unitPrice!: string;
  @ApiProperty({ type: String }) subtotalAmount!: string;
  @ApiProperty({ type: String }) otherAmount!: string;
  @ApiProperty({ type: String }) totalAmount!: string;
  @ApiProperty({ type: String, enum: ['credit', 'settled'] }) settlementMode!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) settleAccountId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) paidAmount!: string | null;
  @ApiProperty({ type: String }) note!: string;
  @ApiProperty({ type: String }) createdAt!: string;
}

export class PurchaseOrderListSummaryDto {
  @ApiProperty({ type: String, description: '筛选全量合计金额' }) totalAmount!: string;
}

export class PurchaseOrderListDto {
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: () => PurchaseOrderListSummaryDto })
  summary!: PurchaseOrderListSummaryDto;
  @ApiProperty({ type: () => [PurchaseOrderDto] }) items!: PurchaseOrderDto[];
}

export class PurchaseSupplierSummaryItemDto {
  @ApiProperty({ type: String }) supplierId!: string;
  @ApiProperty({ type: Number }) purchaseCount!: number;
}

export class PurchaseSupplierSummaryDto {
  @ApiProperty({ type: () => [PurchaseSupplierSummaryItemDto] })
  items!: PurchaseSupplierSummaryItemDto[];
}

export class PurchaseOrderBatchDeleteBodyDto {
  @ApiProperty({ type: [String], description: '要删除的采购单 id 列表（1~200）' })
  ids!: string[];
}

export class PurchaseOrderBatchDeleteResponseDto {
  @ApiProperty({ type: Number, description: '实际删除（软删除）条数' })
  deleted!: number;
}
