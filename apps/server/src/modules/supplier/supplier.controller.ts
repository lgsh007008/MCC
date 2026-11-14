import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  supplierBatchDeleteInputSchema,
  supplierBatchStatusInputSchema,
  supplierInputSchema,
  supplierListQuerySchema,
  supplierNameCheckQuerySchema,
  supplierStatusInputSchema,
  supplierUpdateSchema,
  type SupplierBatchDeleteInput,
  type SupplierBatchStatusInput,
  type SupplierInput,
  type SupplierListQuery,
  type SupplierNameCheckQuery,
  type SupplierStatusInput,
  type SupplierUpdateInput,
} from '@mcc/shared';
import { AuditAction } from '../../common/decorators/audit-action.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { RequireScopes } from '../../common/decorators/require-scopes.decorator.js';
import { withIdempotency } from '../../common/idempotency.js';
import { RedisService } from '../../common/redis.service.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  SupplierBatchDeleteBodyDto,
  SupplierBatchDeleteResponseDto,
  SupplierBatchStatusBodyDto,
  SupplierBatchStatusResponseDto,
  SupplierBodyDto,
  SupplierDto,
  SupplierListDto,
  SupplierNameCheckDto,
  SupplierStatusBodyDto,
} from './dto/supplier.dto.js';
import { SupplierService } from './supplier.service.js';

// 接口清单与路径（design/supplier.md §5）；契约由装饰器代码生成（ADR-006）。
@ApiTags('suppliers')
@Controller('suppliers')
export class SupplierController {
  constructor(
    private readonly supplierService: SupplierService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @RequireScopes('supplier:view')
  @ApiOperation({ summary: '供应商列表：筛选（名称模糊、状态）+ 排序 + 分页' })
  @ApiQuery({ name: 'name', required: false, type: String, description: '供应商名称模糊' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'], type: String, description: '状态' })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['createdAt'],
    type: String,
    description: '排序列，默认 createdAt',
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], type: String, description: '排序方向，默认 desc' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiOkResponse({ type: SupplierListDto })
  list(@Query(new ZodValidationPipe(supplierListQuerySchema)) query: SupplierListQuery): Promise<SupplierListDto> {
    return this.supplierService.list(query);
  }

  // 注意：具体路径须声明在 :id 之前，否则会被 ParseUUIDPipe 当作 id 校验。
  @Get('name-check')
  @RequireScopes('supplier:view')
  @ApiOperation({ summary: '供应商重名检查（只提示不阻断）' })
  @ApiQuery({ name: 'name', required: true, type: String, description: '供应商名称' })
  @ApiQuery({ name: 'excludeId', required: false, type: String, description: '排除的供应商 id（编辑时传自身）' })
  @ApiOkResponse({ type: SupplierNameCheckDto })
  nameCheck(
    @Query(new ZodValidationPipe(supplierNameCheckQuerySchema)) query: SupplierNameCheckQuery,
  ): Promise<{ duplicate: boolean }> {
    return this.supplierService.nameCheck(query);
  }

  @Get(':id')
  @RequireScopes('supplier:view')
  @ApiOperation({ summary: '供应商详情' })
  @ApiOkResponse({ type: SupplierDto })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierDto> {
    return this.supplierService.detail(id);
  }

  @Post()
  @RequireScopes('supplier:manage')
  @AuditAction({ domain: 'supplier', action: 'create', label: '新建供应商', objectType: 'supplier' })
  @HttpCode(201)
  @ApiOperation({ summary: '新建供应商（编号自动生成；重名只提示不阻断）' })
  @ApiBody({ type: SupplierBodyDto })
  @ApiCreatedResponse({ type: SupplierDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(supplierInputSchema)) body: SupplierInput,
  ): Promise<SupplierDto> {
    // 幂等（技术方案 §6.3）：重复提交返回首请求结果，处理中返回 409
    return withIdempotency(this.redis, user.userId, 'suppliers', idempotencyKey, () =>
      this.supplierService.create(body),
    );
  }

  @Put(':id')
  @RequireScopes('supplier:manage')
  @AuditAction({ domain: 'supplier', action: 'update', label: '编辑供应商', objectType: 'supplier' })
  @ApiOperation({ summary: '更新供应商（名称、联系信息、期初应付、备注）' })
  @ApiBody({ type: SupplierBodyDto })
  @ApiOkResponse({ type: SupplierDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(supplierUpdateSchema)) body: SupplierUpdateInput,
  ): Promise<SupplierDto> {
    return this.supplierService.update(id, body);
  }

  @Patch(':id/status')
  @RequireScopes('supplier:manage')
  @AuditAction({ domain: 'supplier', action: 'change-status', label: '切换供应商状态', objectType: 'supplier' })
  @ApiOperation({ summary: '启用 / 停用供应商' })
  @ApiBody({ type: SupplierStatusBodyDto })
  @ApiOkResponse({ type: SupplierDto })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(supplierStatusInputSchema)) body: SupplierStatusInput,
  ): Promise<SupplierDto> {
    return this.supplierService.setStatus(id, body);
  }

  @Post('batch-status')
  @RequireScopes('supplier:manage')
  @AuditAction({ domain: 'supplier', action: 'batch-status', label: '批量启停用供应商', objectType: 'supplier' })
  @HttpCode(200)
  @ApiOperation({ summary: '批量启用 / 停用供应商（已是目标状态或已删的跳过，返回实际变更条数）' })
  @ApiBody({ type: SupplierBatchStatusBodyDto })
  @ApiOkResponse({ type: SupplierBatchStatusResponseDto })
  setStatusMany(
    @Body(new ZodValidationPipe(supplierBatchStatusInputSchema)) body: SupplierBatchStatusInput,
  ): Promise<{ updated: number }> {
    return this.supplierService.setStatusMany(body);
  }

  @Post('batch-delete')
  @RequireScopes('supplier:manage')
  @AuditAction({ domain: 'supplier', action: 'batch-delete', label: '批量删除供应商', objectType: 'supplier' })
  @HttpCode(200)
  @ApiOperation({ summary: '批量删除供应商（软删除；不存在 / 已删行静默跳过，返回删除条数）' })
  @ApiBody({ type: SupplierBatchDeleteBodyDto })
  @ApiOkResponse({ type: SupplierBatchDeleteResponseDto })
  removeMany(
    @Body(new ZodValidationPipe(supplierBatchDeleteInputSchema)) body: SupplierBatchDeleteInput,
  ): Promise<{ deleted: number }> {
    return this.supplierService.removeMany(body);
  }

  @Delete(':id')
  @RequireScopes('supplier:manage')
  @AuditAction({ domain: 'supplier', action: 'delete', label: '删除供应商', objectType: 'supplier' })
  @HttpCode(204)
  @ApiOperation({ summary: '删除供应商（软删除，编号不回收）' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.supplierService.remove(id);
  }
}
