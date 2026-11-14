import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 供应商 OpenAPI 契约形状（ADR-006：契约由装饰器代码生成）。
// 运行时校验以 @mcc/shared 的 zod schema 为准（ZodValidationPipe）。

export class SupplierBodyDto {
  @ApiProperty({ type: String, description: '供应商名称', example: '某某木业' })
  name!: string;

  @ApiPropertyOptional({ type: String, description: '联系信息（电话等）', default: '' })
  contact?: string;

  @ApiPropertyOptional({
    type: String,
    description: '期初应付（上线前净应付，非负、最多 2 位小数）',
    default: '0.00',
  })
  openingPayable?: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;
}

export class SupplierStatusBodyDto {
  @ApiProperty({ type: String, enum: ['active', 'inactive'], description: '状态：active 启用 / inactive 停用' })
  status!: 'active' | 'inactive';
}

export class SupplierBatchStatusBodyDto {
  @ApiProperty({ type: [String], description: '供应商 id 列表（1~200）' })
  ids!: string[];

  @ApiProperty({ type: String, enum: ['active', 'inactive'], description: '目标状态：active 启用 / inactive 停用' })
  status!: 'active' | 'inactive';
}

export class SupplierBatchStatusResponseDto {
  @ApiProperty({ type: Number, description: '实际变更条数（已软删或已处于目标状态的跳过）' })
  updated!: number;
}

export class SupplierBatchDeleteBodyDto {
  @ApiProperty({ type: [String], description: '要删除的供应商 id 列表（1~200）' })
  ids!: string[];
}

export class SupplierBatchDeleteResponseDto {
  @ApiProperty({ type: Number, description: '实际删除（软删除）条数' })
  deleted!: number;
}

export class SupplierDto {
  @ApiProperty({ type: String, description: '供应商 id' })
  id!: string;

  @ApiProperty({ type: String, description: '供应商编号（SP + 5 位流水）' })
  code!: string;

  @ApiProperty({ type: String, description: '供应商名称' })
  name!: string;

  @ApiProperty({ type: String, description: '联系信息' })
  contact!: string;

  @ApiProperty({ type: String, description: '状态：active 启用 / inactive 停用' })
  status!: string;

  @ApiProperty({ type: String, description: '期初应付（上线前净应付）', example: '0.00' })
  openingPayable!: string;

  @ApiProperty({ type: String, description: '备注' })
  note!: string;

  @ApiProperty({ type: String, description: '创建日期（YYYY-MM-DD）' })
  createdAt!: string;
}

export class SupplierListDto {
  @ApiProperty({ type: Number, description: '总数' })
  total!: number;

  @ApiProperty({ type: () => [SupplierDto] })
  items!: SupplierDto[];
}

export class SupplierNameCheckDto {
  @ApiProperty({ type: Boolean, description: '是否存在同名供应商（未软删）' })
  duplicate!: boolean;
}
