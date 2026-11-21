import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 租户与套餐契约形状（ADR-006：由装饰器生成 OpenAPI，不手写接口文档）。
// 运行时校验以 @mcc/shared 的 tenant.schemas 为准。

export class TenantFeatureOverrideDto {
  @ApiProperty({ type: String, description: '可售功能标识' })
  featureCode!: string;

  @ApiProperty({ type: Boolean, description: 'true = 加购启用；false = 关闭' })
  enabled!: boolean;
}

export class TenantListItemDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, description: '租户编号（登录标识）' }) code!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) planId!: string;
  @ApiProperty({ type: String }) planName!: string;
  @ApiProperty({ type: String, enum: ['active', 'suspended'] }) status!: string;
  @ApiProperty({ type: String, enum: ['ops', 'self_register'], description: '开通渠道：运营开通 / 自助注册' })
  source!: string;
  @ApiProperty({ type: Number, description: '套餐账号额度（账号数由 auth 批量接口前端组合）' })
  maxAccounts!: number;
  @ApiProperty({ type: String }) note!: string;
  @ApiProperty({ type: String, description: '创建时间（ISO）' }) createdAt!: string;
}

export class TenantListDto {
  @ApiProperty({ type: Number, description: '筛选后总数' }) total!: number;
  @ApiProperty({ type: () => [TenantListItemDto] }) items!: TenantListItemDto[];
}

export class TenantDetailDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) code!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) planId!: string;
  @ApiProperty({ type: String }) planName!: string;
  @ApiProperty({ type: String, enum: ['active', 'suspended'] }) status!: string;
  @ApiProperty({ type: String, enum: ['ops', 'self_register'], description: '开通渠道：运营开通 / 自助注册' })
  source!: string;
  @ApiProperty({ type: Number }) maxAccounts!: number;
  @ApiProperty({ type: String }) note!: string;
  @ApiProperty({ type: String }) createdAt!: string;
  @ApiProperty({ type: [String], description: '有效功能（基础功能 ∪ 套餐功能 + 覆盖）' })
  effectiveFeatures!: string[];
  @ApiProperty({ type: () => [TenantFeatureOverrideDto], description: '只含与套餐不同的覆盖项' })
  overrides!: TenantFeatureOverrideDto[];
}

export class TenantPlanChangeDto {
  @ApiProperty({ type: String }) planId!: string;
  @ApiProperty({ type: String }) planName!: string;
  @ApiProperty({ type: Number, description: '新套餐账号额度' }) maxAccounts!: number;
  @ApiProperty({ type: [String] }) effectiveFeatures!: string[];
  @ApiProperty({ type: [String], description: '改套餐后新增的功能' }) added!: string[];
  @ApiProperty({ type: [String], description: '改套餐后失去的功能' }) removed!: string[];
}

export class TenantCreateBodyDto {
  @ApiProperty({ type: String, description: '租户名称', example: '梅好木业' })
  name!: string;

  @ApiProperty({ type: String, description: '套餐 id' })
  planId!: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;
}

export class TenantUpdateBodyDto {
  @ApiProperty({ type: String, description: '租户名称' })
  name!: string;

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;
}

export class TenantStatusBodyDto {
  @ApiProperty({ type: String, enum: ['active', 'suspended'], description: '启用 / 停用' })
  status!: string;
}

export class TenantPlanBodyDto {
  @ApiProperty({ type: String, description: '目标套餐 id（须为启用态）' })
  planId!: string;
}

export class TenantFeaturesBodyDto {
  @ApiProperty({
    type: () => [TenantFeatureOverrideDto],
    description: '全量提交覆盖项（只含与套餐不同的项）',
  })
  overrides!: TenantFeatureOverrideDto[];
}
