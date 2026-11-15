import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 套餐契约形状（ADR-006）：功能集合只含可售功能，基础功能不在套餐配置中。

export class PlanDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: Number, description: '账号额度' }) maxAccounts!: number;
  @ApiProperty({ type: String, enum: ['active', 'inactive'] }) status!: string;
  @ApiProperty({ type: [String], description: '套餐包含的可售功能' }) featureCodes!: string[];
  @ApiProperty({ type: String }) note!: string;
  @ApiProperty({ type: Number, description: '使用该套餐的租户数' }) tenantCount!: number;
  @ApiProperty({ type: String }) createdAt!: string;
}

export class PlanListDto {
  @ApiProperty({ type: Number, description: '总数' }) total!: number;
  @ApiProperty({ type: () => [PlanDto] }) items!: PlanDto[];
}

export class PlanCreateBodyDto {
  @ApiProperty({ type: String, description: '套餐名称（唯一）', example: '标准版' })
  name!: string;

  @ApiProperty({ type: Number, description: '账号额度（0 表示不可新建账号）', example: 20 })
  maxAccounts!: number;

  @ApiProperty({ type: [String], description: '可售功能标识集合' })
  featureCodes!: string[];

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;
}

export class PlanStatusBodyDto {
  @ApiProperty({ type: String, enum: ['active', 'inactive'], description: '启用 / 停用' })
  status!: string;
}
