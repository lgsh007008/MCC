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
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  purchaseBatchDeleteSchema,
  purchaseInputSchema,
  purchaseListQuerySchema,
  purchaseSupplierSummaryQuerySchema,
  purchaseUpdateSchema,
  type PurchaseBatchDeleteInput,
  type PurchaseInput,
  type PurchaseListQuery,
  type PurchaseSupplierSummaryQuery,
  type PurchaseUpdateInput,
} from '@mcc/shared';
import { AuditAction } from '../../common/decorators/audit-action.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { RequireScopes } from '../../common/decorators/require-scopes.decorator.js';
import { withIdempotency } from '../../common/idempotency.js';
import { RedisService } from '../../common/redis.service.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  PurchaseOrderBatchDeleteBodyDto,
  PurchaseOrderBatchDeleteResponseDto,
  PurchaseOrderBodyDto,
  PurchaseOrderDto,
  PurchaseOrderListDto,
  PurchaseSupplierSummaryDto,
} from './dto/purchase.dto.js';
import { PurchaseService } from './purchase.service.js';

// 接口清单与路径（design/purchase.md §5）；契约由装饰器代码生成（ADR-006）。
@ApiTags('purchase-orders')
@Controller('purchase-orders')
export class PurchaseController {
  constructor(
    private readonly purchaseService: PurchaseService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @RequireScopes('purchase:view')
  @ApiOperation({ summary: '采购单列表：筛选（编号模糊、供应商、供应商名称模糊、结算方式、日期区间）+ 排序 + 分页' })
  @ApiQuery({ name: 'code', required: false, type: String, description: '采购单编号模糊' })
  @ApiQuery({ name: 'supplierId', required: false, type: String, description: '供应商 id' })
  @ApiQuery({ name: 'supplierName', required: false, type: String, description: '供应商名称模糊' })
  @ApiQuery({ name: 'settlementMode', required: false, enum: ['credit', 'settled'], type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: '采购日期起（YYYY-MM-DD）' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: '采购日期止（YYYY-MM-DD）' })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['purchaseDate', 'totalAmount'],
    type: String,
    description: '排序列，默认 purchaseDate',
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], type: String, description: '排序方向，默认 desc' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiOkResponse({ type: PurchaseOrderListDto })
  list(
    @Query(new ZodValidationPipe(purchaseListQuerySchema)) query: PurchaseListQuery,
  ): Promise<PurchaseOrderListDto> {
    return this.purchaseService.list(query);
  }

  // 注意：具体路径须声明在 :id 之前，否则会被 ParseUUIDPipe 当作 id 校验。
  @Get('supplier-summary')
  @RequireScopes('purchase:view')
  @ApiOperation({ summary: '按供应商返回采购单数（供供应商删除确认）' })
  @ApiQuery({ name: 'supplierIds', required: true, type: String, description: '逗号分隔的供应商 id' })
  @ApiOkResponse({ type: PurchaseSupplierSummaryDto })
  supplierSummary(
    @Query(new ZodValidationPipe(purchaseSupplierSummaryQuerySchema))
    query: PurchaseSupplierSummaryQuery,
  ): Promise<PurchaseSupplierSummaryDto> {
    return this.purchaseService.supplierSummary(query);
  }

  @Get(':id')
  @RequireScopes('purchase:view')
  @ApiOperation({ summary: '采购单详情' })
  @ApiOkResponse({ type: PurchaseOrderDto })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseOrderDto> {
    return this.purchaseService.detail(id);
  }

  @Post()
  @RequireScopes('purchase:manage')
  @AuditAction({ domain: 'purchase', action: 'create', label: '新建采购单', objectType: 'purchase_order' })
  @HttpCode(201)
  @ApiOperation({ summary: '新建采购单（编号自动生成；现结同事务派生付款流水）' })
  @ApiBody({ type: PurchaseOrderBodyDto })
  @ApiCreatedResponse({ type: PurchaseOrderDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(purchaseInputSchema)) body: PurchaseInput,
  ): Promise<PurchaseOrderDto> {
    // 幂等（技术方案 §6.3）：重复提交返回首请求结果，处理中返回 409
    return withIdempotency(this.redis, user.userId, 'purchase-orders', idempotencyKey, () =>
      this.purchaseService.create(body),
    );
  }

  @Post('batch-delete')
  @RequireScopes('purchase:manage')
  @AuditAction({ domain: 'purchase', action: 'batch-delete', label: '批量删除采购单', objectType: 'purchase_order' })
  @HttpCode(200)
  @ApiOperation({ summary: '批量删除采购单（软删除；派生付款流水一并软删；不存在/已删行静默跳过）' })
  @ApiBody({ type: PurchaseOrderBatchDeleteBodyDto })
  @ApiOkResponse({ type: PurchaseOrderBatchDeleteResponseDto })
  batchDelete(
    @Body(new ZodValidationPipe(purchaseBatchDeleteSchema)) body: PurchaseBatchDeleteInput,
  ): Promise<{ deleted: number }> {
    return this.purchaseService.removeMany(body.ids);
  }

  @Put(':id')
  @RequireScopes('purchase:manage')
  @AuditAction({ domain: 'purchase', action: 'update', label: '编辑采购单', objectType: 'purchase_order' })
  @ApiOperation({ summary: '更新采购单（同步金额、供应商、日期与派生付款流水）' })
  @ApiBody({ type: PurchaseOrderBodyDto })
  @ApiOkResponse({ type: PurchaseOrderDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(purchaseUpdateSchema)) body: PurchaseUpdateInput,
  ): Promise<PurchaseOrderDto> {
    return this.purchaseService.update(id, body);
  }

  @Delete(':id')
  @RequireScopes('purchase:manage')
  @AuditAction({ domain: 'purchase', action: 'delete', label: '删除采购单', objectType: 'purchase_order' })
  @HttpCode(204)
  @ApiOperation({ summary: '删除采购单（软删除；派生付款流水一并软删，编号不回收）' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.purchaseService.remove(id);
  }
}
