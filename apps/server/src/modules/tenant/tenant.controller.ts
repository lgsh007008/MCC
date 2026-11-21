import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  tenantCreateSchema,
  tenantFeaturesInputSchema,
  tenantListQuerySchema,
  tenantPlanInputSchema,
  tenantStatusInputSchema,
  tenantUpdateSchema,
  type TenantCreateInput,
  type TenantFeaturesInput,
  type TenantListQuery,
  type TenantPlanInput,
  type TenantStatusInput,
  type TenantUpdateInput,
} from '@mcc/shared';
import { PlatformAuditAction } from '../../common/decorators/platform-audit-action.decorator.js';
import { RequirePlatformScopes } from '../../common/decorators/require-platform-scopes.decorator.js';
import {
  CurrentPlatformUser,
  type PlatformAuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { withIdempotency } from '../../common/idempotency.js';
import { RedisService } from '../../common/redis.service.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  TenantCreateBodyDto,
  TenantDetailDto,
  TenantFeaturesBodyDto,
  TenantListDto,
  TenantPlanBodyDto,
  TenantPlanChangeDto,
  TenantStatusBodyDto,
  TenantUpdateBodyDto,
} from './dto/tenant.dto.js';
import { TenantService } from './tenant.service.js';

// 租户管理接口（design/租户.md §5）：全部在 /ops 下，要求平台 scope。
// 注意：首个租户主键为历史值 default，参数不能使用 ParseUUIDPipe。
@ApiTags('ops-tenants')
@Controller('ops/tenants')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @RequirePlatformScopes('platform:tenant:view')
  @ApiOperation({ summary: '租户列表：编号/名称模糊、状态、套餐 + 分页（账号数由 auth 批量接口前端组合）' })
  @ApiQuery({ name: 'code', required: false, type: String, description: '租户编号模糊' })
  @ApiQuery({ name: 'name', required: false, type: String, description: '租户名称模糊' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'suspended'], description: '状态' })
  @ApiQuery({ name: 'planId', required: false, type: String, description: '套餐 id' })
  @ApiQuery({
    name: 'source',
    required: false,
    enum: ['ops', 'self_register'],
    description: '开通渠道：运营开通 / 自助注册',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiOkResponse({ type: TenantListDto })
  list(@Query(new ZodValidationPipe(tenantListQuerySchema)) query: TenantListQuery): Promise<TenantListDto> {
    return this.tenantService.list(query);
  }

  @Get(':id')
  @RequirePlatformScopes('platform:tenant:view')
  @ApiOperation({ summary: '租户详情：套餐、覆盖项、有效功能（不含账号数）' })
  @ApiOkResponse({ type: TenantDetailDto })
  detail(@Param('id') id: string): Promise<TenantDetailDto> {
    return this.tenantService.detail(id);
  }

  @Post()
  @RequirePlatformScopes('platform:tenant:manage')
  @PlatformAuditAction({ domain: 'tenant', action: 'create-tenant', label: '开通租户', objectType: 'tenant' })
  @HttpCode(201)
  @ApiOperation({ summary: '开通租户：编号自动生成；只建租户，管理员由前端第二步补建' })
  @ApiBody({ type: TenantCreateBodyDto })
  @ApiCreatedResponse({ type: TenantDetailDto })
  create(
    @CurrentPlatformUser() user: PlatformAuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(tenantCreateSchema)) body: TenantCreateInput,
  ): Promise<TenantDetailDto> {
    return withIdempotency(this.redis, user.userId, 'ops-tenants', idempotencyKey, () =>
      this.tenantService.create(body),
    );
  }

  @Put(':id')
  @RequirePlatformScopes('platform:tenant:manage')
  @PlatformAuditAction({ domain: 'tenant', action: 'update-tenant', label: '编辑租户', objectType: 'tenant' })
  @ApiOperation({ summary: '更新租户名称与备注' })
  @ApiBody({ type: TenantUpdateBodyDto })
  @ApiOkResponse({ type: TenantDetailDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tenantUpdateSchema)) body: TenantUpdateInput,
  ): Promise<TenantDetailDto> {
    return this.tenantService.update(id, body);
  }

  @Patch(':id/status')
  @RequirePlatformScopes('platform:tenant:manage')
  @PlatformAuditAction({ domain: 'tenant', action: 'change-tenant-status', label: '启停用租户', objectType: 'tenant' })
  @ApiOperation({ summary: '停用 / 启用租户；停用使 session_epoch + 1，旧令牌立即失效' })
  @ApiBody({ type: TenantStatusBodyDto })
  @ApiOkResponse({ type: TenantDetailDto })
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tenantStatusInputSchema)) body: TenantStatusInput,
  ): Promise<TenantDetailDto> {
    return this.tenantService.setStatus(id, body);
  }

  @Put(':id/plan')
  @RequirePlatformScopes('platform:tenant:manage')
  @PlatformAuditAction({ domain: 'tenant', action: 'change-tenant-plan', label: '修改租户套餐', objectType: 'tenant' })
  @ApiOperation({ summary: '改套餐：校验目标套餐启用态，返回功能差异与额度变化' })
  @ApiBody({ type: TenantPlanBodyDto })
  @ApiOkResponse({ type: TenantPlanChangeDto })
  changePlan(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tenantPlanInputSchema)) body: TenantPlanInput,
  ): Promise<TenantPlanChangeDto> {
    return this.tenantService.changePlan(id, body);
  }

  @Put(':id/features')
  @RequirePlatformScopes('platform:tenant:manage')
  @PlatformAuditAction({ domain: 'tenant', action: 'set-tenant-features', label: '配置租户功能', objectType: 'tenant' })
  @ApiOperation({ summary: '全量提交功能覆盖项（只含与套餐不同的项），返回有效功能' })
  @ApiBody({ type: TenantFeaturesBodyDto })
  @ApiOkResponse({ type: TenantDetailDto })
  setFeatures(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tenantFeaturesInputSchema)) body: TenantFeaturesInput,
  ): Promise<TenantDetailDto> {
    return this.tenantService.setFeatures(id, body);
  }
}
