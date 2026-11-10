import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  financeEventBatchDeleteSchema,
  financeEventInputSchema,
  financeEventListQuerySchema,
  financeEventUpdateSchema,
  financeSummaryQuerySchema,
  type FinanceEventBatchDeleteInput,
  type FinanceEventInput,
  type FinanceEventListQuery,
  type FinanceEventUpdateInput,
  type FinanceSummaryQuery,
} from '@mcc/shared';
import { RequireScopes } from '../../common/decorators/require-scopes.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  FinanceEventBatchDeleteBodyDto,
  FinanceEventBatchDeleteResponseDto,
  FinanceEventBodyDto,
  FinanceEventDto,
  FinanceEventListDto,
  FinanceEventUpdateBodyDto,
  FinanceSummaryDto,
} from './dto/finance.dto.js';
import { FinanceService } from './finance.service.js';

// 接口清单与路径（design/finance.md §5）；契约由装饰器代码生成（ADR-006）。
@ApiTags('finance')
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('events')
  @RequireScopes('finance:view')
  @ApiOperation({ summary: '财务事件列表：筛选（发生日期区间、分类、来源）+ 排序 + 分页' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: '发生日期起（YYYY-MM-DD）' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: '发生日期止（YYYY-MM-DD）' })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['sales_revenue', 'other_revenue', 'purchase_cost', 'labor_cost', 'other_expense'],
    type: String,
  })
  @ApiQuery({ name: 'source', required: false, enum: ['auto', 'manual'], type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['occurredDate', 'amount'], type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], type: String })
  @ApiOkResponse({ type: FinanceEventListDto })
  list(
    @Query(new ZodValidationPipe(financeEventListQuerySchema)) query: FinanceEventListQuery,
  ): Promise<FinanceEventListDto> {
    return this.financeService.list(query);
  }

  @Get('summary')
  @RequireScopes('finance:view')
  @ApiOperation({ summary: '收支汇总（日期区间实时聚合：总收入 / 总成本 / 净利润 / 分类小计）' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: '发生日期起（YYYY-MM-DD）' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: '发生日期止（YYYY-MM-DD）' })
  @ApiOkResponse({ type: FinanceSummaryDto })
  summary(
    @Query(new ZodValidationPipe(financeSummaryQuerySchema)) query: FinanceSummaryQuery,
  ): Promise<FinanceSummaryDto> {
    return this.financeService.summary(query);
  }

  @Get('events/:id')
  @RequireScopes('finance:view')
  @ApiOperation({ summary: '财务事件详情' })
  @ApiOkResponse({ type: FinanceEventDto })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<FinanceEventDto> {
    return this.financeService.detail(id);
  }

  @Post('events')
  @RequireScopes('finance:manage')
  @HttpCode(201)
  @ApiOperation({ summary: '手工记账（仅其他收入 / 其他支出；金额按正数提交）' })
  @ApiBody({ type: FinanceEventBodyDto })
  @ApiCreatedResponse({ type: FinanceEventDto })
  create(
    @Body(new ZodValidationPipe(financeEventInputSchema)) body: FinanceEventInput,
  ): Promise<FinanceEventDto> {
    return this.financeService.create(body);
  }

  @Put('events/:id')
  @RequireScopes('finance:manage')
  @ApiOperation({ summary: '更新手工事件（自动生成的事件不可编辑）' })
  @ApiBody({ type: FinanceEventUpdateBodyDto })
  @ApiOkResponse({ type: FinanceEventDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(financeEventUpdateSchema)) body: FinanceEventUpdateInput,
  ): Promise<FinanceEventDto> {
    return this.financeService.update(id, body);
  }

  @Post('events/batch-delete')
  @RequireScopes('finance:manage')
  @HttpCode(200)
  @ApiOperation({ summary: '批量删除手工事件（软删除；自动事件与不存在行静默跳过）' })
  @ApiBody({ type: FinanceEventBatchDeleteBodyDto })
  @ApiOkResponse({ type: FinanceEventBatchDeleteResponseDto })
  batchDelete(
    @Body(new ZodValidationPipe(financeEventBatchDeleteSchema)) body: FinanceEventBatchDeleteInput,
  ): Promise<{ deleted: number }> {
    return this.financeService.removeMany(body.ids);
  }

  @Delete('events/:id')
  @RequireScopes('finance:manage')
  @HttpCode(204)
  @ApiOperation({ summary: '删除手工事件（软删除；自动事件拒绝）' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.financeService.remove(id);
  }
}
