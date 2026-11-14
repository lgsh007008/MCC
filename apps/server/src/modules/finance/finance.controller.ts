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
  financeAccountInputSchema,
  financeCashEntryInputSchema,
  financeCashEntryListQuerySchema,
  financeCashSummaryQuerySchema,
  financePayablesQuerySchema,
  financeReceivablesQuerySchema,
  financeSummaryQuerySchema,
  type FinanceAccountInput,
  type FinanceCashEntryInput,
  type FinanceCashEntryListQuery,
  type FinanceCashSummaryQuery,
  type FinancePayablesQuery,
  type FinanceReceivablesQuery,
  type FinanceSummaryQuery,
} from '@mcc/shared';
import { AuditAction } from '../../common/decorators/audit-action.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { RequireScopes } from '../../common/decorators/require-scopes.decorator.js';
import { withIdempotency } from '../../common/idempotency.js';
import { RedisService } from '../../common/redis.service.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  FinanceAccountBodyDto,
  FinanceAccountDto,
  FinanceAccountListDto,
  FinanceCashEntryBodyDto,
  FinanceCashEntryDto,
  FinanceCashEntryListDto,
  FinanceCashSummaryDto,
  FinancePayableListDto,
  FinanceReceivableListDto,
} from './dto/cash.dto.js';
import { FinanceSummaryDto } from './dto/finance.dto.js';
import { FinanceService } from './finance.service.js';

// 接口清单与路径（design/finance.md §5）；契约由装饰器代码生成（ADR-006）。
@ApiTags('finance')
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly redis: RedisService,
  ) {}

  @Get('summary')
  @RequireScopes('finance:view')
  @ApiOperation({
    summary: '经营收支汇总（日期区间实时聚合：销售单 + 流水分类；总收入 / 总支出 / 净额）',
  })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: '发生日期起（YYYY-MM-DD）' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: '发生日期止（YYYY-MM-DD）' })
  @ApiOkResponse({ type: FinanceSummaryDto })
  summary(
    @Query(new ZodValidationPipe(financeSummaryQuerySchema)) query: FinanceSummaryQuery,
  ): Promise<FinanceSummaryDto> {
    return this.financeService.summary(query);
  }

  // ── 资金账户（R-财务-002）────────────────────────────────

  @Get('accounts')
  @RequireScopes('finance:view')
  @ApiOperation({ summary: '资金账户列表（不分页；余额 = 期初 + 收 − 付 + 转入 − 转出）' })
  @ApiOkResponse({ type: FinanceAccountListDto })
  listAccounts(): Promise<FinanceAccountListDto> {
    return this.financeService.listAccounts();
  }

  @Post('accounts')
  @RequireScopes('finance:manage')
  @AuditAction({ domain: 'finance', action: 'create-account', label: '新建资金账户', objectType: 'finance_account' })
  @HttpCode(201)
  @ApiOperation({ summary: '新建资金账户（对公 / 对私级联渠道）' })
  @ApiBody({ type: FinanceAccountBodyDto })
  @ApiCreatedResponse({ type: FinanceAccountDto })
  async createAccount(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(financeAccountInputSchema)) body: FinanceAccountInput,
  ): Promise<FinanceAccountDto> {
    // 幂等（技术方案 §6.3）：重复提交返回首请求结果，处理中返回 409
    return withIdempotency(this.redis, user.userId, 'finance-accounts', idempotencyKey, () =>
      this.financeService.createAccount(body),
    );
  }

  @Put('accounts/:id')
  @RequireScopes('finance:manage')
  @AuditAction({ domain: 'finance', action: 'update-account', label: '编辑资金账户', objectType: 'finance_account' })
  @ApiOperation({ summary: '更新资金账户（改名称 / 期初 / 启用状态）' })
  @ApiBody({ type: FinanceAccountBodyDto })
  @ApiOkResponse({ type: FinanceAccountDto })
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(financeAccountInputSchema)) body: FinanceAccountInput,
  ): Promise<FinanceAccountDto> {
    return this.financeService.updateAccount(id, body);
  }

  @Delete('accounts/:id')
  @RequireScopes('finance:manage')
  @AuditAction({ domain: 'finance', action: 'delete-account', label: '删除资金账户', objectType: 'finance_account' })
  @HttpCode(204)
  @ApiOperation({ summary: '删除资金账户（软删除；历史流水保留账户名，编号不复用）' })
  async removeAccount(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.financeService.removeAccount(id);
  }

  // ── 资金流水（R-财务-002）────────────────────────────────

  @Get('cash-entries')
  @RequireScopes('finance:view')
  @ApiOperation({
    summary: '资金流水列表：方向 / 收支分类 / 账户 / 客户 / 日期区间筛选 + 分页 + 筛选全量合计',
  })
  @ApiQuery({ name: 'direction', required: false, enum: ['in', 'out', 'transfer'], type: String })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: [
      'sales_receipt',
      'other_revenue',
      'loan_in',
      'purchase_payment',
      'labor_cost',
      'operating_expense',
      'asset_purchase',
      'loan_repay',
    ],
    type: String,
  })
  @ApiQuery({ name: 'accountId', required: false, type: String })
  @ApiQuery({ name: 'customerId', required: false, type: String, description: '客户 id（收款流水）' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: '发生日期起（YYYY-MM-DD）' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: '发生日期止（YYYY-MM-DD）' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiOkResponse({ type: FinanceCashEntryListDto })
  listCashEntries(
    @Query(new ZodValidationPipe(financeCashEntryListQuerySchema)) query: FinanceCashEntryListQuery,
  ): Promise<FinanceCashEntryListDto> {
    return this.financeService.listCashEntries(query);
  }

  @Get('cash-summary')
  @RequireScopes('finance:view')
  @ApiOperation({ summary: '资金汇总（期间收款 / 付款 / 净流入 + 各账户当前余额）' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiOkResponse({ type: FinanceCashSummaryDto })
  cashSummary(
    @Query(new ZodValidationPipe(financeCashSummaryQuerySchema)) query: FinanceCashSummaryQuery,
  ): Promise<FinanceCashSummaryDto> {
    return this.financeService.cashSummary(query);
  }

  @Get('receivables')
  @RequireScopes('finance:view')
  @ApiOperation({ summary: '客户应收（批量）：累计销售 / 累计收款 / 欠款（负数为预收）' })
  @ApiQuery({ name: 'customerIds', required: true, type: String, description: '逗号分隔的客户 id' })
  @ApiOkResponse({ type: FinanceReceivableListDto })
  receivables(
    @Query(new ZodValidationPipe(financeReceivablesQuerySchema)) query: FinanceReceivablesQuery,
  ): Promise<FinanceReceivableListDto> {
    return this.financeService.receivables(query);
  }

  @Get('payables')
  @RequireScopes('finance:view')
  @ApiOperation({ summary: '供应商应付（批量）：累计采购 / 累计付款 / 应付（负数为预付）' })
  @ApiQuery({ name: 'supplierIds', required: true, type: String, description: '逗号分隔的供应商 id' })
  @ApiOkResponse({ type: FinancePayableListDto })
  payables(
    @Query(new ZodValidationPipe(financePayablesQuerySchema)) query: FinancePayablesQuery,
  ): Promise<FinancePayableListDto> {
    return this.financeService.payables(query);
  }

  @Post('cash-entries')
  @RequireScopes('finance:manage')
  @AuditAction({ domain: 'finance', action: 'create-cash-entry', label: '登记资金流水', objectType: 'finance_cash_entry' })
  @HttpCode(201)
  @ApiOperation({ summary: '登记资金流水（收支分类按方向必选；销售回款挂客户）' })
  @ApiBody({ type: FinanceCashEntryBodyDto })
  @ApiCreatedResponse({ type: FinanceCashEntryDto })
  async createCashEntry(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(financeCashEntryInputSchema)) body: FinanceCashEntryInput,
  ): Promise<FinanceCashEntryDto> {
    // 幂等（技术方案 §6.3）：重复提交返回首请求结果，处理中返回 409
    return withIdempotency(this.redis, user.userId, 'finance-cash-entries', idempotencyKey, () =>
      this.financeService.createCashEntry(body),
    );
  }

  @Put('cash-entries/:id')
  @RequireScopes('finance:manage')
  @AuditAction({ domain: 'finance', action: 'update-cash-entry', label: '编辑资金流水', objectType: 'finance_cash_entry' })
  @ApiOperation({ summary: '更新资金流水' })
  @ApiBody({ type: FinanceCashEntryBodyDto })
  @ApiOkResponse({ type: FinanceCashEntryDto })
  updateCashEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(financeCashEntryInputSchema)) body: FinanceCashEntryInput,
  ): Promise<FinanceCashEntryDto> {
    return this.financeService.updateCashEntry(id, body);
  }

  @Get('cash-entries/:id')
  @RequireScopes('finance:view')
  @ApiOperation({ summary: '资金流水详情（单条，含来源与可编辑标记）' })
  @ApiOkResponse({ type: FinanceCashEntryDto })
  async cashEntryDetail(@Param('id', ParseUUIDPipe) id: string): Promise<FinanceCashEntryDto> {
    return this.financeService.cashEntryDetail(id);
  }

  @Delete('cash-entries/:id')
  @RequireScopes('finance:manage')
  @AuditAction({ domain: 'finance', action: 'delete-cash-entry', label: '删除资金流水', objectType: 'finance_cash_entry' })
  @HttpCode(204)
  @ApiOperation({ summary: '删除资金流水（软删除；余额随之回退）' })
  async removeCashEntry(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.financeService.removeCashEntry(id);
  }
}
