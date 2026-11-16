import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  palletListQuerySchema,
  palletProjectInputSchema,
  type PalletListQuery,
  type PalletProjectInput,
} from '@mcc/shared';
import { AuditAction } from '../../common/decorators/audit-action.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { RequireFeature } from '../../common/decorators/require-feature.decorator.js';
import { RequireScopes } from '../../common/decorators/require-scopes.decorator.js';
import { withIdempotency } from '../../common/idempotency.js';
import { RedisService } from '../../common/redis.service.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  PalletMaterialDto,
  PalletProjectBodyDto,
  PalletProjectDto,
  PalletProjectListDto,
} from './dto/pallet.dto.js';
import { PalletService } from './pallet.service.js';

// 接口清单与路径见 design/托盘设计.md §5；契约由装饰器代码生成（ADR-006）。
@ApiTags('pallet')
@Controller('pallet')
@RequireFeature('pallet_design')
export class PalletController {
  constructor(
    private readonly palletService: PalletService,
    private readonly redis: RedisService,
  ) {}

  @Get('projects')
  @RequireScopes('pallet:view')
  @ApiOperation({ summary: '托盘项目列表：关键字 / 模板筛选 + 分页' })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: '项目名称 / 编号 / 客户名称模糊' })
  @ApiQuery({
    name: 'templateType',
    required: false,
    enum: ['block', 'stringer', 'notched', 'skid', 'plywood', 'custom'],
    type: String,
    description: '结构模板',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], type: String, description: '更新时间排序，默认 desc' })
  @ApiOkResponse({ type: PalletProjectListDto })
  list(@Query(new ZodValidationPipe(palletListQuerySchema)) query: PalletListQuery): Promise<PalletProjectListDto> {
    return this.palletService.list(query);
  }

  @Get('projects/:id')
  @RequireScopes('pallet:view')
  @ApiOperation({ summary: '托盘项目详情（含构件）' })
  @ApiOkResponse({ type: PalletProjectDto })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<PalletProjectDto> {
    return this.palletService.detail(id);
  }

  @Post('projects')
  @RequireScopes('pallet:manage')
  @AuditAction({ domain: 'pallet', action: 'create', label: '新建托盘项目', objectType: 'pallet-project' })
  @HttpCode(201)
  @ApiOperation({ summary: '新建托盘项目（PD 编号自动生成）' })
  @ApiBody({ type: PalletProjectBodyDto })
  @ApiCreatedResponse({ type: PalletProjectDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(palletProjectInputSchema)) body: PalletProjectInput,
  ): Promise<PalletProjectDto> {
    return withIdempotency(this.redis, user.userId, 'pallet-projects', idempotencyKey, () =>
      this.palletService.create(body),
    );
  }

  @Put('projects/:id')
  @RequireScopes('pallet:manage')
  @AuditAction({ domain: 'pallet', action: 'update', label: '编辑托盘项目', objectType: 'pallet-project' })
  @ApiOperation({ summary: '更新托盘项目与构件（整单提交，服务端重算合计）' })
  @ApiBody({ type: PalletProjectBodyDto })
  @ApiOkResponse({ type: PalletProjectDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(palletProjectInputSchema)) body: PalletProjectInput,
  ): Promise<PalletProjectDto> {
    return this.palletService.update(id, body);
  }

  @Post('projects/:id/duplicate')
  @RequireScopes('pallet:manage')
  @AuditAction({ domain: 'pallet', action: 'duplicate', label: '复制托盘项目', objectType: 'pallet-project' })
  @HttpCode(201)
  @ApiOperation({ summary: '复制托盘项目（生成新编号）' })
  @ApiCreatedResponse({ type: PalletProjectDto })
  duplicate(@Param('id', ParseUUIDPipe) id: string): Promise<PalletProjectDto> {
    return this.palletService.duplicate(id);
  }

  @Delete('projects/:id')
  @RequireScopes('pallet:manage')
  @AuditAction({ domain: 'pallet', action: 'delete', label: '删除托盘项目', objectType: 'pallet-project' })
  @HttpCode(204)
  @ApiOperation({ summary: '删除托盘项目（软删除，编号不回收）' })
  @ApiNoContentResponse({ description: '已删除' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.palletService.remove(id);
  }

  @Get('materials')
  @RequireScopes('pallet:view')
  @ApiOperation({ summary: '托盘材料目录（只读）' })
  @ApiOkResponse({ type: [PalletMaterialDto] })
  materials(): Promise<PalletMaterialDto[]> {
    return this.palletService.listMaterials();
  }
}
