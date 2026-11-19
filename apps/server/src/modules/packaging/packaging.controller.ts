import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
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
  packagingListQuerySchema,
  packagingProjectInputSchema,
  type PackagingListQuery,
  type PackagingProjectInput,
} from '@mcc/shared';
import { AuditAction } from '../../common/decorators/audit-action.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { RequireFeature } from '../../common/decorators/require-feature.decorator.js';
import { RequireScopes } from '../../common/decorators/require-scopes.decorator.js';
import { withIdempotency } from '../../common/idempotency.js';
import { RedisService } from '../../common/redis.service.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  PackagingMaterialDto,
  PackagingProjectBodyDto,
  PackagingProjectDto,
  PackagingProjectListDto,
  PackagingRevisionDetailDto,
  PackagingRevisionDto,
  PackagingRevisionListDto,
  PackagingTemplateDto,
} from './dto/packaging.dto.js';
import { PackagingService } from './packaging.service.js';

// 接口清单与路径见 design/包装设计.md §7；契约由装饰器代码生成（ADR-006）。
@ApiTags('packaging')
@Controller('packaging')
@RequireFeature('packaging_design')
export class PackagingController {
  constructor(
    private readonly packagingService: PackagingService,
    private readonly redis: RedisService,
  ) {}

  @Get('projects')
  @RequireScopes('packaging:view')
  @ApiOperation({ summary: '包装方案列表：关键字 / 单元类型 / 状态筛选 + 分页' })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: '方案名称 / 编号 / 客户名称模糊' })
  @ApiQuery({
    name: 'unitType',
    required: false,
    enum: ['PALLET', 'CRATE', 'SKID', 'FRAME', 'DIVIDER', 'DUNNAGE', 'STEEL_STRAP'],
    type: String,
    description: '单元类型',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'ISSUED', 'ARCHIVED'], type: String, description: '状态' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], type: String, description: '更新时间排序，默认 desc' })
  @ApiOkResponse({ type: PackagingProjectListDto })
  list(@Query(new ZodValidationPipe(packagingListQuerySchema)) query: PackagingListQuery): Promise<PackagingProjectListDto> {
    return this.packagingService.list(query);
  }

  @Get('projects/:id')
  @RequireScopes('packaging:view')
  @ApiOperation({ summary: '包装方案详情（含单元与构件）' })
  @ApiOkResponse({ type: PackagingProjectDto })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<PackagingProjectDto> {
    return this.packagingService.detail(id);
  }

  @Post('projects')
  @RequireScopes('packaging:manage')
  @AuditAction({ domain: 'packaging', action: 'create', label: '新建包装方案', objectType: 'packaging-project' })
  @HttpCode(201)
  @ApiOperation({ summary: '新建包装方案（PD 编号自动生成）' })
  @ApiBody({ type: PackagingProjectBodyDto })
  @ApiCreatedResponse({ type: PackagingProjectDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(packagingProjectInputSchema)) body: PackagingProjectInput,
  ): Promise<PackagingProjectDto> {
    return withIdempotency(this.redis, user.userId, 'packaging-projects', idempotencyKey, () =>
      this.packagingService.create(body),
    );
  }

  @Put('projects/:id')
  @RequireScopes('packaging:manage')
  @AuditAction({ domain: 'packaging', action: 'update', label: '编辑包装方案', objectType: 'packaging-project' })
  @ApiOperation({ summary: '更新包装方案、单元与构件（整单提交，服务端重算合计）' })
  @ApiBody({ type: PackagingProjectBodyDto })
  @ApiOkResponse({ type: PackagingProjectDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(packagingProjectInputSchema)) body: PackagingProjectInput,
  ): Promise<PackagingProjectDto> {
    return this.packagingService.update(id, body);
  }

  @Post('projects/:id/duplicate')
  @RequireScopes('packaging:manage')
  @AuditAction({ domain: 'packaging', action: 'duplicate', label: '复制包装方案', objectType: 'packaging-project' })
  @HttpCode(201)
  @ApiOperation({ summary: '复制包装方案（生成新编号）' })
  @ApiCreatedResponse({ type: PackagingProjectDto })
  duplicate(@Param('id', ParseUUIDPipe) id: string): Promise<PackagingProjectDto> {
    return this.packagingService.duplicate(id);
  }

  @Post('projects/:id/issue')
  @RequireScopes('packaging:manage')
  @AuditAction({ domain: 'packaging', action: 'issue', label: '发布包装方案', objectType: 'packaging-project' })
  @HttpCode(201)
  @ApiOperation({ summary: '发布包装方案（生成不可变版本，锁定设计数据）' })
  @ApiCreatedResponse({ type: PackagingRevisionDto })
  issue(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PackagingRevisionDto> {
    return this.packagingService.issue(id, user.userId);
  }

  @Post('projects/:id/next-revision')
  @RequireScopes('packaging:manage')
  @AuditAction({ domain: 'packaging', action: 'next-revision', label: '新建包装方案下一版本', objectType: 'packaging-project' })
  @HttpCode(201)
  @ApiOperation({ summary: '已发布方案新建下一版本（回到草稿，保留历史快照）' })
  @ApiCreatedResponse({ type: PackagingProjectDto })
  nextRevision(@Param('id', ParseUUIDPipe) id: string): Promise<PackagingProjectDto> {
    return this.packagingService.nextRevision(id);
  }

  @Get('projects/:id/revisions')
  @RequireScopes('packaging:view')
  @ApiOperation({ summary: '包装方案版本列表' })
  @ApiOkResponse({ type: PackagingRevisionListDto })
  revisions(@Param('id', ParseUUIDPipe) id: string): Promise<PackagingRevisionListDto> {
    return this.packagingService.listRevisions(id);
  }

  @Get('projects/:id/revisions/:revisionNo')
  @RequireScopes('packaging:view')
  @ApiOperation({ summary: '包装方案版本快照' })
  @ApiOkResponse({ type: PackagingRevisionDetailDto })
  revision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionNo', ParseIntPipe) revisionNo: number,
  ): Promise<PackagingRevisionDetailDto> {
    return this.packagingService.revisionDetail(id, revisionNo);
  }

  @Delete('projects/:id')
  @RequireScopes('packaging:manage')
  @AuditAction({ domain: 'packaging', action: 'delete', label: '删除包装方案', objectType: 'packaging-project' })
  @HttpCode(204)
  @ApiOperation({ summary: '删除包装方案（软删除，编号不回收）' })
  @ApiNoContentResponse({ description: '已删除' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.packagingService.remove(id);
  }

  @Get('templates')
  @RequireScopes('packaging:view')
  @ApiOperation({ summary: '包装设计模板目录（首次读取落预置）' })
  @ApiQuery({
    name: 'unitType',
    required: false,
    enum: ['PALLET', 'CRATE', 'SKID', 'FRAME', 'DIVIDER', 'DUNNAGE', 'STEEL_STRAP'],
    type: String,
    description: '按单元类型筛选',
  })
  @ApiOkResponse({ type: [PackagingTemplateDto] })
  templates(@Query('unitType') unitType?: string): Promise<PackagingTemplateDto[]> {
    return this.packagingService.listTemplates(unitType);
  }

  @Get('materials')
  @RequireScopes('packaging:view')
  @ApiOperation({ summary: '包装材料目录（只读）' })
  @ApiOkResponse({ type: [PackagingMaterialDto] })
  materials(): Promise<PackagingMaterialDto[]> {
    return this.packagingService.listMaterials();
  }
}
