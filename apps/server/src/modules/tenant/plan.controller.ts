import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  planCreateSchema,
  planStatusInputSchema,
  planUpdateSchema,
  type PlanCreateInput,
  type PlanStatusInput,
  type PlanUpdateInput,
} from '@mcc/shared';
import { PlatformAuditAction } from '../../common/decorators/platform-audit-action.decorator.js';
import { RequirePlatformScopes } from '../../common/decorators/require-platform-scopes.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PlanCreateBodyDto, PlanDto, PlanListDto, PlanStatusBodyDto } from './dto/plan.dto.js';
import { TenantService } from './tenant.service.js';

// 套餐管理接口（design/租户.md §5）：套餐不可删除，只可停用；停用不影响存量租户。
@ApiTags('ops-plans')
@Controller('ops/plans')
export class PlanController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  @RequirePlatformScopes('platform:tenant:view')
  @ApiOperation({ summary: '套餐列表（含使用该套餐的租户数）' })
  @ApiOkResponse({ type: PlanListDto })
  list(): Promise<PlanListDto> {
    return this.tenantService.listPlans();
  }

  @Post()
  @RequirePlatformScopes('platform:tenant:manage')
  @PlatformAuditAction({ domain: 'plan', action: 'create-plan', label: '新建套餐', objectType: 'plan' })
  @ApiOperation({ summary: '新建套餐（名称唯一；功能只含可售功能；账号额度）' })
  @ApiBody({ type: PlanCreateBodyDto })
  @ApiCreatedResponse({ type: PlanDto })
  create(
    @Body(new ZodValidationPipe(planCreateSchema)) body: PlanCreateInput,
  ): Promise<PlanDto> {
    return this.tenantService.createPlan(body);
  }

  @Put(':id')
  @RequirePlatformScopes('platform:tenant:manage')
  @PlatformAuditAction({ domain: 'plan', action: 'update-plan', label: '编辑套餐', objectType: 'plan' })
  @ApiOperation({ summary: '更新套餐名称、功能集合、账号额度与备注' })
  @ApiBody({ type: PlanCreateBodyDto })
  @ApiOkResponse({ type: PlanDto })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(planUpdateSchema)) body: PlanUpdateInput,
  ): Promise<PlanDto> {
    return this.tenantService.updatePlan(id, body);
  }

  @Patch(':id/status')
  @RequirePlatformScopes('platform:tenant:manage')
  @PlatformAuditAction({ domain: 'plan', action: 'change-plan-status', label: '启停用套餐', objectType: 'plan' })
  @ApiOperation({ summary: '停用 / 启用套餐；停用后不可被新租户选择，存量租户不受影响' })
  @ApiBody({ type: PlanStatusBodyDto })
  @ApiOkResponse({ type: PlanDto })
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(planStatusInputSchema)) body: PlanStatusInput,
  ): Promise<PlanDto> {
    return this.tenantService.setPlanStatus(id, body);
  }
}
