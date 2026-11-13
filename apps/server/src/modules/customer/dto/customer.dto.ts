import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// OpenAPI 契约的请求/响应形状（ADR-006：契约由装饰器代码生成）。
// 运行时校验以 @mcc/shared 的 zod schema 为准（ZodValidationPipe），本文件只承载契约形状。

// ── 请求体 ──────────────────────────────────────────────

export class CustomerBodyDto {
  @ApiProperty({ type: String, description: '客户名称', example: '张三木材店' })
  name!: string;

  @ApiPropertyOptional({ type: String, description: '联系信息（电话等）', default: '' })
  contact?: string;

  @ApiPropertyOptional({
    type: String,
    description: '期初欠款（上线前净欠款，非负、最多 2 位小数）',
    default: '0.00',
  })
  openingDebt?: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;
}

export class CustomerStatusBodyDto {
  @ApiProperty({ type: String, enum: ['active', 'inactive'], description: '状态：active 启用 / inactive 停用' })
  status!: 'active' | 'inactive';
}

export class CustomerBatchStatusBodyDto {
  @ApiProperty({ type: [String], description: '客户 id 列表（1~200）' })
  ids!: string[];

  @ApiProperty({ type: String, enum: ['active', 'inactive'], description: '目标状态：active 启用 / inactive 停用' })
  status!: 'active' | 'inactive';
}

export class CustomerBatchStatusResponseDto {
  @ApiProperty({ type: Number, description: '实际变更条数（已软删或已处于目标状态的跳过）' })
  updated!: number;
}

export class CustomerBatchDeleteBodyDto {
  @ApiProperty({ type: [String], description: '要删除的客户 id 列表（1~200）' })
  ids!: string[];
}

export class CustomerBatchDeleteResponseDto {
  @ApiProperty({ type: Number, description: '实际删除（软删除）条数' })
  deleted!: number;
}

// ── 响应体 ──────────────────────────────────────────────

export class CustomerDto {
  @ApiProperty({ type: String, description: '客户 id' })
  id!: string;

  @ApiProperty({ type: String, description: '客户编号（C + 5 位流水）' })
  code!: string;

  @ApiProperty({ type: String, description: '客户名称' })
  name!: string;

  @ApiProperty({ type: String, description: '联系信息' })
  contact!: string;

  @ApiProperty({ type: String, description: '状态：active 启用 / inactive 停用' })
  status!: string;

  @ApiProperty({ type: String, description: '期初欠款（上线前净欠款）', example: '0.00' })
  openingDebt!: string;

  @ApiProperty({ type: String, description: '备注' })
  note!: string;

  @ApiProperty({ type: String, description: '创建日期（YYYY-MM-DD）' })
  createdAt!: string;
}

export class CustomerListDto {
  @ApiProperty({ type: Number, description: '总数' })
  total!: number;

  @ApiProperty({ type: () => [CustomerDto] })
  items!: CustomerDto[];
}

export class CustomerNameCheckDto {
  @ApiProperty({ type: Boolean, description: '是否存在同名客户（未软删）' })
  duplicate!: boolean;
}
