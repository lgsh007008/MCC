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
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  inventoryCountInputSchema,
  inventoryCountListQuerySchema,
  inventoryOpeningInputSchema,
  materialIssueBatchDeleteSchema,
  materialIssueInputSchema,
  materialIssueListQuerySchema,
  materialIssueUpdateSchema,
  productionOutputBatchDeleteSchema,
  productionOutputInputSchema,
  productionOutputListQuerySchema,
  productionOutputUpdateSchema,
  type InventoryCountInput,
  type InventoryCountListQuery,
  type InventoryOpeningInput,
  type MaterialIssueBatchDeleteInput,
  type MaterialIssueInput,
  type MaterialIssueListQuery,
  type MaterialIssueUpdateInput,
  type ProductionOutputBatchDeleteInput,
  type ProductionOutputInput,
  type ProductionOutputListQuery,
  type ProductionOutputUpdateInput,
} from '@mcc/shared';
import { AuditAction } from '../../common/decorators/audit-action.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { RequireFeature } from '../../common/decorators/require-feature.decorator.js';
import { RequireScopes } from '../../common/decorators/require-scopes.decorator.js';
import { withIdempotency } from '../../common/idempotency.js';
import { RedisService } from '../../common/redis.service.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  InventoryAdjustmentResultDto,
  InventoryCountBodyDto,
  InventoryCountDetailDto,
  InventoryCountListDto,
  InventoryOpeningBodyDto,
  InventoryOpeningDetailDto,
  InventorySummaryDto,
} from './dto/inventory.dto.js';
import {
  MaterialIssueBatchDeleteBodyDto,
  MaterialIssueBatchDeleteResponseDto,
  MaterialIssueBodyDto,
  MaterialIssueDto,
  MaterialIssueListDto,
  ProductionOutputBatchDeleteBodyDto,
  ProductionOutputBatchDeleteResponseDto,
  ProductionOutputBodyDto,
  ProductionOutputDto,
  ProductionOutputListDto,
  ProductionOutputUpdateBodyDto,
} from './dto/production.dto.js';
import { ProductionService } from './production.service.js';

// 接口清单与路径（design/生产与库存.md §5）；契约由装饰器代码生成（ADR-006）。
// 原木领用（MI）与方木产出（PR）是两张独立单据。
@ApiTags('production')
@Controller()
@RequireFeature('production')
export class ProductionController {
  constructor(
    private readonly productionService: ProductionService,
    private readonly redis: RedisService,
  ) {}

  // ── 原木领用 ──────────────────────────────────────────

  @Get('material-issues')
  @RequireScopes('production:view')
  @ApiOperation({ summary: '原木领用列表：领用日期区间 + 分页；含领用吨数合计' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: '领用日期起（YYYY-MM-DD）' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: '领用日期止（YYYY-MM-DD）' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiOkResponse({ type: MaterialIssueListDto })
  listIssues(
    @Query(new ZodValidationPipe(materialIssueListQuerySchema)) query: MaterialIssueListQuery,
  ): Promise<MaterialIssueListDto> {
    return this.productionService.listIssues(query);
  }

  @Get('material-issues/:id')
  @RequireScopes('production:view')
  @ApiOperation({ summary: '原木领用详情' })
  @ApiOkResponse({ type: MaterialIssueDto })
  issueDetail(@Param('id', ParseUUIDPipe) id: string): Promise<MaterialIssueDto> {
    return this.productionService.issueDetail(id);
  }

  @Post('material-issues')
  @RequireScopes('production:manage')
  @AuditAction({
    domain: 'production',
    action: 'create',
    label: '新建原木领用',
    objectType: 'material_issue',
  })
  @HttpCode(201)
  @ApiOperation({ summary: '新建原木领用；重复提交防抖：请求头 Idempotency-Key' })
  @ApiBody({ type: MaterialIssueBodyDto })
  @ApiCreatedResponse({ type: MaterialIssueDto })
  async createIssue(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(materialIssueInputSchema)) body: MaterialIssueInput,
  ): Promise<MaterialIssueDto> {
    return withIdempotency(this.redis, user.userId, 'material-issues', idempotencyKey, () =>
      this.productionService.createIssue(body),
    );
  }

  @Put('material-issues/:id')
  @RequireScopes('production:manage')
  @AuditAction({
    domain: 'production',
    action: 'update',
    label: '编辑原木领用',
    objectType: 'material_issue',
  })
  @ApiOperation({ summary: '更新原木领用' })
  @ApiBody({ type: MaterialIssueBodyDto })
  @ApiOkResponse({ type: MaterialIssueDto })
  updateIssue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(materialIssueUpdateSchema)) body: MaterialIssueUpdateInput,
  ): Promise<MaterialIssueDto> {
    return this.productionService.updateIssue(id, body);
  }

  @Post('material-issues/batch-delete')
  @RequireScopes('production:manage')
  @AuditAction({
    domain: 'production',
    action: 'batch-delete',
    label: '批量删除原木领用',
    objectType: 'material_issue',
  })
  @HttpCode(200)
  @ApiOperation({ summary: '批量删除原木领用（软删除；不存在/已删行静默跳过）' })
  @ApiBody({ type: MaterialIssueBatchDeleteBodyDto })
  @ApiOkResponse({ type: MaterialIssueBatchDeleteResponseDto })
  batchDeleteIssues(
    @Body(new ZodValidationPipe(materialIssueBatchDeleteSchema)) body: MaterialIssueBatchDeleteInput,
  ): Promise<{ deleted: number }> {
    return this.productionService.removeIssues(body.ids);
  }

  @Delete('material-issues/:id')
  @RequireScopes('production:manage')
  @AuditAction({
    domain: 'production',
    action: 'delete',
    label: '删除原木领用',
    objectType: 'material_issue',
  })
  @HttpCode(204)
  @ApiOperation({ summary: '删除原木领用（软删除，编号不回收）' })
  async removeIssue(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.productionService.removeIssue(id);
  }

  // ── 方木产出 ──────────────────────────────────────────

  @Get('production-outputs')
  @RequireScopes('production:view')
  @ApiOperation({ summary: '方木产出列表：产出日期区间 + 分页；含产出总方数合计' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: '产出日期起（YYYY-MM-DD）' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: '产出日期止（YYYY-MM-DD）' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiOkResponse({ type: ProductionOutputListDto })
  listOutputs(
    @Query(new ZodValidationPipe(productionOutputListQuerySchema)) query: ProductionOutputListQuery,
  ): Promise<ProductionOutputListDto> {
    return this.productionService.listOutputs(query);
  }

  @Get('production-outputs/:id')
  @RequireScopes('production:view')
  @ApiOperation({ summary: '方木产出详情（含产出明细）' })
  @ApiOkResponse({ type: ProductionOutputDto })
  outputDetail(@Param('id', ParseUUIDPipe) id: string): Promise<ProductionOutputDto> {
    return this.productionService.outputDetail(id);
  }

  @Post('production-outputs')
  @RequireScopes('production:manage')
  @AuditAction({
    domain: 'production',
    action: 'create',
    label: '新建方木产出',
    objectType: 'production_output',
  })
  @HttpCode(201)
  @ApiOperation({ summary: '新建方木产出；重复提交防抖：请求头 Idempotency-Key' })
  @ApiBody({ type: ProductionOutputBodyDto })
  @ApiCreatedResponse({ type: ProductionOutputDto })
  async createOutput(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(productionOutputInputSchema)) body: ProductionOutputInput,
  ): Promise<ProductionOutputDto> {
    return withIdempotency(this.redis, user.userId, 'production-outputs', idempotencyKey, () =>
      this.productionService.createOutput(body),
    );
  }

  @Put('production-outputs/:id')
  @RequireScopes('production:manage')
  @AuditAction({
    domain: 'production',
    action: 'update',
    label: '编辑方木产出',
    objectType: 'production_output',
  })
  @ApiOperation({ summary: '更新方木产出（整单提交，产出明细同步）' })
  @ApiBody({ type: ProductionOutputUpdateBodyDto })
  @ApiOkResponse({ type: ProductionOutputDto })
  updateOutput(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(productionOutputUpdateSchema)) body: ProductionOutputUpdateInput,
  ): Promise<ProductionOutputDto> {
    return this.productionService.updateOutput(id, body);
  }

  @Post('production-outputs/batch-delete')
  @RequireScopes('production:manage')
  @AuditAction({
    domain: 'production',
    action: 'batch-delete',
    label: '批量删除方木产出',
    objectType: 'production_output',
  })
  @HttpCode(200)
  @ApiOperation({ summary: '批量删除方木产出（软删除；不存在/已删行静默跳过）' })
  @ApiBody({ type: ProductionOutputBatchDeleteBodyDto })
  @ApiOkResponse({ type: ProductionOutputBatchDeleteResponseDto })
  batchDeleteOutputs(
    @Body(new ZodValidationPipe(productionOutputBatchDeleteSchema))
    body: ProductionOutputBatchDeleteInput,
  ): Promise<{ deleted: number }> {
    return this.productionService.removeOutputs(body.ids);
  }

  @Delete('production-outputs/:id')
  @RequireScopes('production:manage')
  @AuditAction({
    domain: 'production',
    action: 'delete',
    label: '删除方木产出',
    objectType: 'production_output',
  })
  @HttpCode(204)
  @ApiOperation({ summary: '删除方木产出（软删除，编号不回收）' })
  async removeOutput(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.productionService.removeOutput(id);
  }

  // ── 库存 ──────────────────────────────────────────────

  @Get('inventory/summary')
  @RequireScopes('inventory:view')
  @ApiOperation({ summary: '当前库存汇总：原木 / 方木库存、成本、总值、负库存与期初状态' })
  @ApiOkResponse({ type: InventorySummaryDto })
  inventorySummary(): Promise<InventorySummaryDto> {
    return this.productionService.getInventorySummary();
  }

  @Get('inventory/openings/current')
  @RequireScopes('inventory:view')
  @ApiOperation({ summary: '当前期初库存只读详情（头 + 原木 / 方木明细）' })
  @ApiOkResponse({ type: InventoryOpeningDetailDto })
  openingCurrent(): Promise<InventoryOpeningDetailDto> {
    return this.productionService.getOpeningCurrent();
  }

  @Get('inventory/counts')
  @RequireScopes('inventory:view')
  @ApiOperation({ summary: '盘点记录列表：类型 + 日期区间 + 分页；含操作人、盘盈 / 盘亏项数与差异金额' })
  @ApiQuery({
    name: 'targetType',
    required: false,
    enum: ['raw_log', 'timber'],
    description: '盘点类型筛选',
  })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: '盘点日期起（YYYY-MM-DD）' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: '盘点日期止（YYYY-MM-DD）' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiOkResponse({ type: InventoryCountListDto })
  countList(
    @Query(new ZodValidationPipe(inventoryCountListQuerySchema)) query: InventoryCountListQuery,
  ): Promise<InventoryCountListDto> {
    return this.productionService.listCounts(query);
  }

  @Get('inventory/counts/:id')
  @RequireScopes('inventory:view')
  @ApiOperation({ summary: '盘点记录详情（头含盘点类型 + 明细）' })
  @ApiOkResponse({ type: InventoryCountDetailDto })
  countDetail(@Param('id', ParseUUIDPipe) id: string): Promise<InventoryCountDetailDto> {
    return this.productionService.getCountDetail(id);
  }

  @Post('inventory/openings')
  @RequireScopes('inventory:manage')
  @AuditAction({
    domain: 'production',
    action: 'opening',
    label: '设置库存期初',
    objectType: 'inventory_adjustment',
  })
  @HttpCode(201)
  @ApiOperation({ summary: '设置库存期初（IC 编号；仅允许一次；Idempotency-Key）' })
  @ApiBody({ type: InventoryOpeningBodyDto })
  @ApiCreatedResponse({ type: InventoryAdjustmentResultDto })
  async createOpening(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(inventoryOpeningInputSchema)) body: InventoryOpeningInput,
  ): Promise<InventoryAdjustmentResultDto> {
    return withIdempotency(this.redis, user.userId, 'inventory-openings', idempotencyKey, () =>
      this.productionService.createOpening(body, { id: user.userId, name: user.username }),
    );
  }

  @Post('inventory/counts')
  @RequireScopes('inventory:manage')
  @AuditAction({
    domain: 'production',
    action: 'count',
    label: '库存盘点',
    objectType: 'inventory_adjustment',
  })
  @HttpCode(201)
  @ApiOperation({ summary: '库存盘点（IC 编号；单类型、实盘可空、原因可选；Idempotency-Key）' })
  @ApiBody({ type: InventoryCountBodyDto })
  @ApiCreatedResponse({ type: InventoryAdjustmentResultDto })
  async createCount(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(inventoryCountInputSchema)) body: InventoryCountInput,
  ): Promise<InventoryAdjustmentResultDto> {
    return withIdempotency(this.redis, user.userId, 'inventory-counts', idempotencyKey, () =>
      this.productionService.createCount(body, { id: user.userId, name: user.username }),
    );
  }
}
