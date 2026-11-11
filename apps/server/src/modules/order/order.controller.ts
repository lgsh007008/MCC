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
import { createHash } from 'node:crypto';
import {
  customerVolumeSummaryQuerySchema,
  saleOrderBatchDeleteSchema,
  saleOrderInputSchema,
  saleOrderListQuerySchema,
  saleOrderUpdateSchema,
  type CustomerVolumeSummaryQuery,
  type SaleOrderBatchDeleteInput,
  type SaleOrderInput,
  type SaleOrderListQuery,
  type SaleOrderUpdateInput,
} from '@mcc/shared';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { RequireScopes } from '../../common/decorators/require-scopes.decorator.js';
import { problem } from '../../common/http-problem.js';
import { RedisService } from '../../common/redis.service.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  CustomerVolumeSummaryDto,
  SaleOrderBatchDeleteBodyDto,
  SaleOrderBatchDeleteResponseDto,
  SaleOrderBodyDto,
  SaleOrderDto,
  SaleOrderListDto,
  SaleOrderUpdateBodyDto,
} from './dto/order.dto.js';
import { OrderService } from './order.service.js';

const IDEMPOTENCY_TTL_SECONDS = 86_400;

// 接口清单与路径（design/order.md §5）；契约由装饰器代码生成（ADR-006）。
@ApiTags('sale-orders')
@Controller('sale-orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @RequireScopes('order:view')
  @ApiOperation({ summary: '销售单列表：筛选（销售日期区间、客户）+ 排序 + 分页' })
  @ApiQuery({ name: 'customerId', required: false, type: String, description: '客户 id' })
  @ApiQuery({ name: 'customerName', required: false, type: String, description: '客户名称快照模糊' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: '销售日期起（YYYY-MM-DD）' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: '销售日期止（YYYY-MM-DD）' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['saleDate', 'totalVolume', 'totalAmount'], type: String, description: '排序字段，默认 saleDate' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], type: String, description: '排序方向，默认 desc' })
  @ApiOkResponse({ type: SaleOrderListDto })
  list(
    @Query(new ZodValidationPipe(saleOrderListQuerySchema)) query: SaleOrderListQuery,
  ): Promise<SaleOrderListDto> {
    return this.orderService.list(query);
  }

  // 注意：具体路径须声明在 :id 之前，否则会被 ParseUUIDPipe 当作 id 校验。
  @Get('customer-volume-summary')
  @RequireScopes('order:view')
  @ApiOperation({ summary: '客户维度累计方量（未软删销售单合计，供客户列表/详情批量取数）' })
  @ApiQuery({ name: 'customerIds', required: true, type: String, description: '客户 id，逗号分隔（1~200）' })
  @ApiOkResponse({ type: CustomerVolumeSummaryDto })
  customerVolumeSummary(
    @Query(new ZodValidationPipe(customerVolumeSummaryQuerySchema))
    query: CustomerVolumeSummaryQuery,
  ): Promise<{ items: Array<{ customerId: string; totalVolume: string }> }> {
    return this.orderService.customerVolumeSummary(query.customerIds);
  }

  @Get(':id')
  @RequireScopes('order:view')
  @ApiOperation({ summary: '销售单详情（含明细）' })
  @ApiOkResponse({ type: SaleOrderDto })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<SaleOrderDto> {
    return this.orderService.detail(id);
  }

  @Post()
  @RequireScopes('order:manage')
  @HttpCode(201)
  @ApiOperation({ summary: '新建销售单；重复提交防抖：请求头 Idempotency-Key' })
  @ApiBody({ type: SaleOrderBodyDto })
  @ApiCreatedResponse({ type: SaleOrderDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(saleOrderInputSchema)) body: SaleOrderInput,
  ): Promise<SaleOrderDto> {
    // 幂等（技术方案 §6.3）：同键并发/重复提交返回首请求结果，处理中返回 409
    if (idempotencyKey) {
      const key = `idem:sale-orders:${user.userId}:${createHash('sha256')
        .update(idempotencyKey)
        .digest('hex')}`;
      const locked = await this.redis.set(key, 'pending', 'EX', IDEMPOTENCY_TTL_SECONDS, 'NX');
      if (locked === null) {
        const previous = await this.redis.get(key);
        if (previous && previous !== 'pending') {
          return JSON.parse(previous) as SaleOrderDto;
        }
        throw problem(409, 'IN_PROGRESS', '同一请求正在处理中，请勿重复提交');
      }
      try {
        const result = await this.orderService.create(body);
        await this.redis.set(key, JSON.stringify(result), 'EX', IDEMPOTENCY_TTL_SECONDS);
        return result;
      } catch (error) {
        await this.redis.del(key).catch(() => undefined);
        throw error;
      }
    }
    return this.orderService.create(body);
  }

  @Put(':id')
  @RequireScopes('order:manage')
  @ApiOperation({ summary: '更新销售单（整单提交：明细重算落账）' })
  @ApiBody({ type: SaleOrderUpdateBodyDto })
  @ApiOkResponse({ type: SaleOrderDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(saleOrderUpdateSchema)) body: SaleOrderUpdateInput,
  ): Promise<SaleOrderDto> {
    return this.orderService.update(id, body);
  }

  @Post('batch-delete')
  @RequireScopes('order:manage')
  @HttpCode(200)
  @ApiOperation({ summary: '批量删除销售单（软删除；不存在/已删行静默跳过）' })
  @ApiBody({ type: SaleOrderBatchDeleteBodyDto })
  @ApiOkResponse({ type: SaleOrderBatchDeleteResponseDto })
  batchDelete(
    @Body(new ZodValidationPipe(saleOrderBatchDeleteSchema)) body: SaleOrderBatchDeleteInput,
  ): Promise<{ deleted: number }> {
    return this.orderService.removeMany(body.ids);
  }

  @Delete(':id')
  @RequireScopes('order:manage')
  @HttpCode(204)
  @ApiOperation({ summary: '删除销售单（软删除，编号不回收）' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.orderService.remove(id);
  }
}