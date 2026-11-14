import { Injectable } from '@nestjs/common';
import { Prisma } from '@mcc/db';
import {
  calcAccountBalance,
  calcBusinessSummary,
  calcPayable,
  calcReceivable,
  sumMoney,
  type CashBalanceLine,
  type FinanceAccountInput,
  type FinanceAccountKind,
  type FinanceAccountChannel,
  type FinanceCashCategoryValue,
  type FinanceCashDirection,
  type FinanceCashEntryInput,
  type FinanceCashEntryListQuery,
  type FinanceCashMethod,
  type FinanceCashSummaryQuery,
  type FinancePayablesQuery,
  type FinanceReceivablesQuery,
  type FinanceSummaryQuery,
} from '@mcc/shared';
import { problem } from '../../common/http-problem.js';
import { PrismaService } from '../../common/prisma.service.js';
import { CustomerService } from '../customer/index.js';
import { SupplierService } from '../supplier/index.js';
import type { FinanceSummaryDto } from './dto/finance.dto.js';
import type {
  FinanceAccountDto,
  FinanceAccountListDto,
  FinanceCashEntryDto,
  FinanceCashEntryListDto,
  FinanceCashSummaryDto,
  FinancePayableListDto,
  FinanceReceivableListDto,
} from './dto/cash.dto.js';

// 财务单轨制（design/finance.md §2 / §3）：
// 资金流水是唯一录入入口，方向与收支分类决定经营口径；销售单现结由订单域在同一事务内派生收款流水。

// ── 资金字典映射（R-财务-002）──────────────

type DbAccountKind = 'CORPORATE' | 'PERSONAL';
type DbAccountChannel = 'BANK' | 'WECHAT' | 'ALIPAY' | 'CASH' | 'BILL';
type DbCashDirection = 'IN' | 'OUT' | 'TRANSFER';
type DbCashMethod = 'BANK' | 'WECHAT' | 'ALIPAY' | 'CASH' | 'ACCEPTANCE';
type DbCashCategory =
  | 'SALES_RECEIPT'
  | 'OTHER_REVENUE'
  | 'LOAN_IN'
  | 'PURCHASE_PAYMENT'
  | 'LABOR_COST'
  | 'OPERATING_EXPENSE'
  | 'ASSET_PURCHASE'
  | 'LOAN_REPAY';

const CASH_CATEGORY_TO_DB: Record<FinanceCashCategoryValue, DbCashCategory> = {
  sales_receipt: 'SALES_RECEIPT',
  other_revenue: 'OTHER_REVENUE',
  loan_in: 'LOAN_IN',
  purchase_payment: 'PURCHASE_PAYMENT',
  labor_cost: 'LABOR_COST',
  operating_expense: 'OPERATING_EXPENSE',
  asset_purchase: 'ASSET_PURCHASE',
  loan_repay: 'LOAN_REPAY',
};
const CASH_CATEGORY_FROM_DB: Record<DbCashCategory, FinanceCashCategoryValue> = {
  SALES_RECEIPT: 'sales_receipt',
  OTHER_REVENUE: 'other_revenue',
  LOAN_IN: 'loan_in',
  PURCHASE_PAYMENT: 'purchase_payment',
  LABOR_COST: 'labor_cost',
  OPERATING_EXPENSE: 'operating_expense',
  ASSET_PURCHASE: 'asset_purchase',
  LOAN_REPAY: 'loan_repay',
};

const ACCOUNT_KIND_TO_DB: Record<FinanceAccountKind, DbAccountKind> = {
  corporate: 'CORPORATE',
  personal: 'PERSONAL',
};
const ACCOUNT_KIND_FROM_DB: Record<DbAccountKind, FinanceAccountKind> = {
  CORPORATE: 'corporate',
  PERSONAL: 'personal',
};

const ACCOUNT_CHANNEL_TO_DB: Record<FinanceAccountChannel, DbAccountChannel> = {
  bank: 'BANK',
  wechat: 'WECHAT',
  alipay: 'ALIPAY',
  cash: 'CASH',
  bill: 'BILL',
};
const ACCOUNT_CHANNEL_FROM_DB: Record<DbAccountChannel, FinanceAccountChannel> = {
  BANK: 'bank',
  WECHAT: 'wechat',
  ALIPAY: 'alipay',
  CASH: 'cash',
  BILL: 'bill',
};

const CASH_DIRECTION_TO_DB: Record<FinanceCashDirection, DbCashDirection> = {
  in: 'IN',
  out: 'OUT',
  transfer: 'TRANSFER',
};
const CASH_DIRECTION_FROM_DB: Record<DbCashDirection, FinanceCashDirection> = {
  IN: 'in',
  OUT: 'out',
  TRANSFER: 'transfer',
};

const CASH_METHOD_FROM_DB: Record<DbCashMethod, FinanceCashMethod> = {
  BANK: 'bank',
  WECHAT: 'wechat',
  ALIPAY: 'alipay',
  CASH: 'cash',
  ACCEPTANCE: 'acceptance',
};

// 账户渠道 → 流水方式（自动派生流水不再让用户选方式）
const CHANNEL_TO_METHOD: Record<DbAccountChannel, DbCashMethod> = {
  BANK: 'BANK',
  WECHAT: 'WECHAT',
  ALIPAY: 'ALIPAY',
  CASH: 'CASH',
  BILL: 'ACCEPTANCE',
};

const SOURCE_TYPE_LABELS = {
  sale_order: '销售单',
  purchase_order: '采购单',
} as const;
type SourceType = keyof typeof SOURCE_TYPE_LABELS;


const money = (value: string | Prisma.Decimal): string => sumMoney([value.toString()]);
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const CODE_RETRY_LIMIT = 3;
// 全局编号规范（1-产品文档.md 五）：前缀 + 连字符 + 5 位全局流水，不含日期
const ACCOUNT_CODE_PREFIX = 'AC-';
const CASH_CODE_PREFIX = 'CF-';
const CODE_PAD = 5;

interface AccountRow {
  id: string;
  code: string;
  name: string;
  kind: DbAccountKind;
  channel: DbAccountChannel;
  openingBalance: Prisma.Decimal;
  active: boolean;
}

interface CashEntryRow {
  id: string;
  code: string;
  direction: DbCashDirection;
  occurredDate: Date;
  amount: Prisma.Decimal;
  accountId: string;
  account: { name: string };
  toAccountId: string | null;
  toAccount: { name: string } | null;
  customerId: string | null;
  customerName: string;
  supplierId: string | null;
  supplierName: string;
  method: DbCashMethod;
  category: DbCashCategory | null;
  note: string;
  sourceType: string | null;
  sourceId: string | null;
  sourceCode: string | null;
}

const CASH_ENTRY_SELECT = {
  id: true,
  code: true,
  direction: true,
  occurredDate: true,
  amount: true,
  accountId: true,
  account: { select: { name: true } },
  toAccountId: true,
  toAccount: { select: { name: true } },
  customerId: true,
  customerName: true,
  supplierId: true,
  supplierName: true,
  method: true,
  category: true,
  note: true,
  sourceType: true,
  sourceId: true,
  sourceCode: true,
} satisfies Prisma.FinanceCashEntrySelect;

const ACCOUNT_SELECT = {
  id: true,
  code: true,
  name: true,
  kind: true,
  channel: true,
  openingBalance: true,
  active: true,
} satisfies Prisma.FinanceAccountSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SourceCashEntryInput {
  sourceType: SourceType;
  sourceId: string;
  sourceCode: string;
  direction: 'in' | 'out';
  category: FinanceCashCategoryValue;
  occurredDate: string;
  amount: string;
  accountId: string;
  customerId?: string | null;
  customerName?: string;
  supplierId?: string | null;
  supplierName?: string;
  note?: string;
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
    private readonly supplierService: SupplierService,
  ) {}

  // 经营收支汇总：销售与采购均按应计（现结取实收 / 实付、赊销 / 赊购取合计）+ 流水分类按实际收付；不落库
  async summary(query: FinanceSummaryQuery): Promise<FinanceSummaryDto> {
    const orderWhere: Prisma.SaleOrderWhereInput = { deletedAt: null };
    const purchaseWhere: Prisma.PurchaseOrderWhereInput = { deletedAt: null };
    const entryWhere: Prisma.FinanceCashEntryWhereInput = {
      deletedAt: null,
      direction: { in: ['IN', 'OUT'] },
      category: { in: ['OTHER_REVENUE', 'LABOR_COST', 'OPERATING_EXPENSE'] },
    };
    if (query.dateFrom || query.dateTo) {
      orderWhere.saleDate = {};
      purchaseWhere.purchaseDate = {};
      entryWhere.occurredDate = {};
      if (query.dateFrom) {
        const from = toDate(query.dateFrom);
        orderWhere.saleDate.gte = from;
        purchaseWhere.purchaseDate.gte = from;
        entryWhere.occurredDate.gte = from;
      }
      if (query.dateTo) {
        const to = toDate(query.dateTo);
        orderWhere.saleDate.lte = to;
        purchaseWhere.purchaseDate.lte = to;
        entryWhere.occurredDate.lte = to;
      }
    }
    const [orders, purchases, entries] = await Promise.all([
      this.prisma.client.saleOrder.findMany({
        where: orderWhere,
        select: { settlementMode: true, receivedAmount: true, totalAmount: true },
      }),
      this.prisma.client.purchaseOrder.findMany({
        where: purchaseWhere,
        select: { settlementMode: true, paidAmount: true, totalAmount: true },
      }),
      this.prisma.client.financeCashEntry.findMany({
        where: entryWhere,
        select: { category: true, amount: true },
      }),
    ]);
    const salesAmounts = orders.map((order) =>
      money(order.settlementMode === 'SETTLED' ? order.receivedAmount : order.totalAmount),
    );
    const purchaseAmounts = purchases.map((purchase) =>
      money(
        purchase.settlementMode === 'SETTLED'
          ? purchase.paidAmount ?? '0'
          : purchase.totalAmount,
      ),
    );
    const cashLines = entries
      .filter((entry) => entry.category !== null)
      .map((entry) => ({
        category: CASH_CATEGORY_FROM_DB[entry.category as DbCashCategory],
        amount: money(entry.amount),
      }));
    const summary = calcBusinessSummary(salesAmounts, purchaseAmounts, cashLines);
    return {
      totalIncome: summary.totalIncome,
      totalExpense: summary.totalExpense,
      netAmount: summary.netAmount,
      orderCount: orders.length,
      purchaseCount: purchases.length,
      cashEntryCount: entries.length,
      categories: summary.byCategory,
    };
  }

  // ── 订单域联动（design/finance.md §6）：由 order 在同一事务内调用 ──

  // 销售单删除（含批量）：对应收款流水一并软删
  async syncSaleOrderRemoval(tx: Prisma.TransactionClient, orderIds: string[]): Promise<void> {
    await this.removeSourceCashEntries(tx, 'sale_order', orderIds);
  }

  // ── 源单流水（一次录入）────────────────────────────────

  async syncSourceCashEntry(
    tx: Prisma.TransactionClient,
    input: SourceCashEntryInput,
  ): Promise<void> {
    const account = await tx.financeAccount.findFirst({
      where: { id: input.accountId, deletedAt: null },
      select: { channel: true },
    });
    if (!account) {
      throw problem(400, 'ACCOUNT_NOT_FOUND', '资金账户不存在');
    }
    const data = {
      direction: CASH_DIRECTION_TO_DB[input.direction],
      occurredDate: toDate(input.occurredDate),
      amount: input.amount,
      accountId: input.accountId,
      toAccountId: null,
      customerId: input.customerId ?? null,
      customerName: input.customerName ?? '',
      supplierId: input.supplierId ?? null,
      supplierName: input.supplierName ?? '',
      method: CHANNEL_TO_METHOD[account.channel],
      category: CASH_CATEGORY_TO_DB[input.category],
      note: input.note ?? '',
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceCode: input.sourceCode,
      deletedAt: null,
    };
    const existing = await tx.financeCashEntry.findFirst({
      where: { sourceType: input.sourceType, sourceId: input.sourceId },
      select: { id: true },
    });
    if (existing) {
      await tx.financeCashEntry.updateMany({ where: { id: existing.id }, data });
      return;
    }
    const code = await this.nextCashCode(tx);
    await tx.financeCashEntry.create({ data: { code, ...data } });
  }

  async removeSourceCashEntries(
    tx: Prisma.TransactionClient,
    sourceType: SourceType,
    sourceIds: string[],
  ): Promise<void> {
    if (sourceIds.length === 0) {
      return;
    }
    await tx.financeCashEntry.updateMany({
      where: { sourceType, sourceId: { in: sourceIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  // ── 资金账户（product/finance.md R-财务-002）──────────────────

  private nextAccountCode(tx: Prisma.TransactionClient): Promise<string> {
    return tx.financeAccount
      .findFirst({
        where: { code: { startsWith: ACCOUNT_CODE_PREFIX } },
        orderBy: { code: 'desc' },
        select: { code: true },
      })
      .then((last) => {
        const seq = last ? Number(last.code.slice(ACCOUNT_CODE_PREFIX.length)) + 1 : 1;
        return `${ACCOUNT_CODE_PREFIX}${String(seq).padStart(CODE_PAD, '0')}`;
      });
  }

  private cashLines(
    rows: { direction: DbCashDirection; amount: Prisma.Decimal; accountId: string; toAccountId: string | null }[],
  ): CashBalanceLine[] {
    return rows.map((row) => ({
      direction: CASH_DIRECTION_FROM_DB[row.direction],
      amount: money(row.amount),
      accountId: row.accountId,
      toAccountId: row.toAccountId,
    }));
  }

  private toAccountDto(row: AccountRow, lines: CashBalanceLine[]): FinanceAccountDto {
    const openingBalance = money(row.openingBalance);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      kind: ACCOUNT_KIND_FROM_DB[row.kind],
      channel: ACCOUNT_CHANNEL_FROM_DB[row.channel],
      openingBalance,
      balance: calcAccountBalance(row.id, openingBalance, lines),
      active: row.active,
    };
  }

  // 账户列表：不分页（账户数量少），余额按全部未删流水实时计算；entryCount 供删除确认文案
  async listAccounts(): Promise<FinanceAccountListDto> {
    const [accounts, entries, entryCounts] = await Promise.all([
      this.prisma.client.financeAccount.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: ACCOUNT_SELECT,
      }),
      this.prisma.client.financeCashEntry.findMany({
        where: { deletedAt: null },
        select: { direction: true, amount: true, accountId: true, toAccountId: true },
      }),
      this.prisma.client.financeCashEntry.groupBy({
        by: ['accountId'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
    ]);
    const lines = this.cashLines(entries);
    return {
      items: accounts.map((row) => ({
        ...this.toAccountDto(row, lines),
        entryCount: entryCounts.find((item) => item.accountId === row.id)?._count._all ?? 0,
      })),
    };
  }

  private async accountDetail(id: string): Promise<FinanceAccountDto> {
    const row = await this.prisma.client.financeAccount.findFirst({
      where: { id, deletedAt: null },
      select: ACCOUNT_SELECT,
    });
    if (!row) {
      throw problem(404, 'NOT_FOUND', '资金账户不存在');
    }
    const entries = await this.prisma.client.financeCashEntry.findMany({
      where: { deletedAt: null, OR: [{ accountId: id }, { toAccountId: id }] },
      select: { direction: true, amount: true, accountId: true, toAccountId: true },
    });
    return this.toAccountDto(row, this.cashLines(entries));
  }

  async createAccount(input: FinanceAccountInput): Promise<FinanceAccountDto> {
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt++) {
      try {
        const created = await this.prisma.client.$transaction(async (tx) => {
          const code = await this.nextAccountCode(tx);
          return tx.financeAccount.create({
            data: {
              code,
              name: input.name,
              kind: ACCOUNT_KIND_TO_DB[input.kind],
              channel: ACCOUNT_CHANNEL_TO_DB[input.channel],
              openingBalance: input.openingBalance,
              active: input.active,
            },
            select: { id: true },
          });
        });
        return this.accountDetail(created.id);
      } catch (error) {
        if (
          attempt < CODE_RETRY_LIMIT - 1 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('unreachable');
  }

  // 状态 / 名称 / 期初的编辑入口；删除走 removeAccount（软删除）
  async updateAccount(id: string, input: FinanceAccountInput): Promise<FinanceAccountDto> {
    const result = await this.prisma.client.financeAccount.updateMany({
      where: { id, deletedAt: null },
      data: {
        name: input.name,
        kind: ACCOUNT_KIND_TO_DB[input.kind],
        channel: ACCOUNT_CHANNEL_TO_DB[input.channel],
        openingBalance: input.openingBalance,
        active: input.active,
      },
    });
    if (result.count === 0) {
      throw problem(404, 'NOT_FOUND', '资金账户不存在');
    }
    return this.accountDetail(id);
  }

  // 删除 = 软删除；历史流水仍可取到账户名，编号不复用
  async removeAccount(id: string): Promise<void> {
    const result = await this.prisma.client.financeAccount.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw problem(404, 'NOT_FOUND', '资金账户不存在');
    }
  }

  // ── 资金流水（product/finance.md R-财务-002）──────────────────

  private nextCashCode(tx: Prisma.TransactionClient): Promise<string> {
    return tx.financeCashEntry
      .findFirst({
        where: { code: { startsWith: CASH_CODE_PREFIX } },
        orderBy: { code: 'desc' },
        select: { code: true },
      })
      .then((last) => {
        const seq = last ? Number(last.code.slice(CASH_CODE_PREFIX.length)) + 1 : 1;
        return `${CASH_CODE_PREFIX}${String(seq).padStart(CODE_PAD, '0')}`;
      });
  }

  private toCashDto(row: CashEntryRow): FinanceCashEntryDto {
    return {
      id: row.id,
      code: row.code,
      direction: CASH_DIRECTION_FROM_DB[row.direction],
      occurredDate: isoDate(row.occurredDate),
      amount: money(row.amount),
      accountId: row.accountId,
      accountName: row.account.name,
      toAccountId: row.toAccountId,
      toAccountName: row.toAccount?.name ?? null,
      customerId: row.customerId,
      customerName: row.customerName,
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      method: CASH_METHOD_FROM_DB[row.method],
      category: row.category ? CASH_CATEGORY_FROM_DB[row.category] : null,
      note: row.note,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      sourceCode: row.sourceCode,
      sourceLabel: row.sourceType
        ? SOURCE_TYPE_LABELS[row.sourceType as SourceType] ?? row.sourceType
        : null,
      editable: row.sourceType === null,
    };
  }

  async listCashEntries(query: FinanceCashEntryListQuery): Promise<FinanceCashEntryListDto> {
    const where: Prisma.FinanceCashEntryWhereInput = { deletedAt: null };
    if (query.direction) {
      where.direction = CASH_DIRECTION_TO_DB[query.direction];
    }
    if (query.category) {
      where.category = CASH_CATEGORY_TO_DB[query.category];
    }
    if (query.accountId) {
      // 账户视角：转出与转入都算该账户的流水
      where.OR = [{ accountId: query.accountId }, { toAccountId: query.accountId }];
    }
    if (query.customerId) {
      // 客户只挂在收款流水上，选中客户后自然只剩该客户的收款
      where.customerId = query.customerId;
    }
    if (query.supplierId) {
      // 供应商只挂在采购付款流水上，选中供应商后自然只剩该供应商的付款
      where.supplierId = query.supplierId;
    }
    if (query.dateFrom || query.dateTo) {
      where.occurredDate = {};
      if (query.dateFrom) {
        where.occurredDate.gte = toDate(query.dateFrom);
      }
      if (query.dateTo) {
        where.occurredDate.lte = toDate(query.dateTo);
      }
    }
    const [total, rows, sums] = await Promise.all([
      this.prisma.client.financeCashEntry.count({ where }),
      this.prisma.client.financeCashEntry.findMany({
        where,
        orderBy: [{ occurredDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: CASH_ENTRY_SELECT,
      }),
      // 合计行：对筛选全量聚合（排除分页）；内部转账不计入收付
      this.prisma.client.financeCashEntry.groupBy({
        by: ['direction'],
        where,
        _sum: { amount: true },
      }),
    ]);
    const sumOf = (direction: DbCashDirection): string =>
      money(sums.find((row) => row.direction === direction)?._sum.amount ?? '0');
    const receipts = sumOf('IN');
    const payments = sumOf('OUT');
    return {
      total,
      summary: { receipts, payments, net: sumMoney([receipts, `-${payments}`]) },
      items: rows.map((row) => this.toCashDto(row)),
    };
  }

  private async accountChannel(id: string): Promise<DbAccountChannel> {
    const account = await this.prisma.client.financeAccount.findFirst({
      where: { id, deletedAt: null },
      select: { channel: true },
    });
    if (!account) {
      throw problem(400, 'ACCOUNT_NOT_FOUND', '资金账户不存在');
    }
    return account.channel;
  }

  // 仅销售回款挂客户、仅采购付款挂供应商，并快照名称；方式由资金账户渠道推导
  private async resolveCashParties(input: FinanceCashEntryInput): Promise<{
    customerId: string | null;
    customerName: string;
    supplierId: string | null;
    supplierName: string;
    method: DbCashMethod;
  }> {
    const channel = await this.accountChannel(input.accountId);
    if (input.direction === 'transfer' && input.toAccountId) {
      await this.accountChannel(input.toAccountId);
    }
    const method = CHANNEL_TO_METHOD[channel];
    let customerId: string | null = null;
    let customerName = '';
    let supplierId: string | null = null;
    let supplierName = '';
    if (input.direction === 'in' && input.category === 'sales_receipt') {
      const customer = input.customerId
        ? await this.customerService.findById(input.customerId)
        : null;
      if (!customer || customer.deleted) {
        throw problem(400, 'CUSTOMER_NOT_FOUND', '客户不存在');
      }
      customerId = customer.id;
      customerName = customer.name;
    }
    if (input.direction === 'out' && input.category === 'purchase_payment') {
      const supplier = input.supplierId
        ? await this.supplierService.findById(input.supplierId)
        : null;
      if (!supplier || supplier.deleted) {
        throw problem(400, 'SUPPLIER_NOT_FOUND', '供应商不存在');
      }
      supplierId = supplier.id;
      supplierName = supplier.name;
    }
    return { customerId, customerName, supplierId, supplierName, method };
  }

  async cashEntryDetail(id: string): Promise<FinanceCashEntryDto> {
    const row = await this.prisma.client.financeCashEntry.findFirst({
      where: { id, deletedAt: null },
      select: CASH_ENTRY_SELECT,
    });
    if (!row) {
      throw problem(404, 'NOT_FOUND', '资金流水不存在');
    }
    return this.toCashDto(row);
  }

  async createCashEntry(input: FinanceCashEntryInput): Promise<FinanceCashEntryDto> {
    const parties = await this.resolveCashParties(input);
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt++) {
      try {
        const created = await this.prisma.client.$transaction(async (tx) => {
          const code = await this.nextCashCode(tx);
          return tx.financeCashEntry.create({
            data: {
              code,
              direction: CASH_DIRECTION_TO_DB[input.direction],
              occurredDate: toDate(input.occurredDate),
              amount: input.amount,
              accountId: input.accountId,
              toAccountId: input.direction === 'transfer' ? input.toAccountId ?? null : null,
              customerId: parties.customerId,
              customerName: parties.customerName,
              supplierId: parties.supplierId,
              supplierName: parties.supplierName,
              method: parties.method,
              category: input.category ? CASH_CATEGORY_TO_DB[input.category] : null,
              note: input.note,
            },
            select: { id: true },
          });
        });
        return this.cashEntryDetail(created.id);
      } catch (error) {
        if (
          attempt < CODE_RETRY_LIMIT - 1 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('unreachable');
  }

  async updateCashEntry(id: string, input: FinanceCashEntryInput): Promise<FinanceCashEntryDto> {
    const existing = await this.prisma.client.financeCashEntry.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, sourceType: true },
    });
    if (!existing) {
      throw problem(404, 'NOT_FOUND', '资金流水不存在');
    }
    if (existing.sourceType) {
      throw problem(400, 'SOURCE_ENTRY_READONLY', '源单派生的流水不可直接修改，请回来源单据操作');
    }
    const parties = await this.resolveCashParties(input);
    await this.prisma.client.financeCashEntry.updateMany({
      where: { id, deletedAt: null },
      data: {
        direction: CASH_DIRECTION_TO_DB[input.direction],
        occurredDate: toDate(input.occurredDate),
        amount: input.amount,
        accountId: input.accountId,
        toAccountId: input.direction === 'transfer' ? input.toAccountId ?? null : null,
        customerId: parties.customerId,
        customerName: parties.customerName,
        supplierId: parties.supplierId,
        supplierName: parties.supplierName,
        method: parties.method,
        category: input.category ? CASH_CATEGORY_TO_DB[input.category] : null,
        note: input.note,
      },
    });
    return this.cashEntryDetail(id);
  }

  // 删除 = 软删除；源单流水拒绝，必须回源单操作
  async removeCashEntry(id: string): Promise<void> {
    const existing = await this.prisma.client.financeCashEntry.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, sourceType: true },
    });
    if (!existing) {
      throw problem(404, 'NOT_FOUND', '资金流水不存在');
    }
    if (existing.sourceType) {
      throw problem(400, 'SOURCE_ENTRY_READONLY', '源单派生的流水不可直接删除，请回来源单据操作');
    }
    await this.prisma.client.financeCashEntry.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  // 资金汇总：期间收付 + 各账户当前余额；内部转账不计入收付
  async cashSummary(query: FinanceCashSummaryQuery): Promise<FinanceCashSummaryDto> {
    const entryWhere: Prisma.FinanceCashEntryWhereInput = { deletedAt: null };
    if (query.dateFrom || query.dateTo) {
      entryWhere.occurredDate = {};
      if (query.dateFrom) {
        entryWhere.occurredDate.gte = toDate(query.dateFrom);
      }
      if (query.dateTo) {
        entryWhere.occurredDate.lte = toDate(query.dateTo);
      }
    }
    const [accounts, entries] = await Promise.all([
      this.listAccounts(),
      this.prisma.client.financeCashEntry.findMany({
        where: entryWhere,
        select: { direction: true, amount: true },
      }),
    ]);
    let receipts = '0.00';
    let payments = '0.00';
    for (const entry of entries) {
      if (entry.direction === 'IN') {
        receipts = sumMoney([receipts, money(entry.amount)]);
      } else if (entry.direction === 'OUT') {
        payments = sumMoney([payments, money(entry.amount)]);
      }
    }
    return {
      receipts,
      payments,
      netFlow: sumMoney([receipts, `-${payments}`]),
      totalFunds: sumMoney(accounts.items.map((item) => item.balance)),
      accounts: accounts.items,
    };
  }

  // 应收：欠款 = 累计销售 − 累计收款（负数为预收）。
  // 销售合计对 order 域表只读聚合；累计收款只取挂该客户的销售回款流水。
  async receivables(query: FinanceReceivablesQuery): Promise<FinanceReceivableListDto> {
    const ids = [
      ...new Set(
        query.customerIds
          .split(',')
          .map((value) => value.trim())
          .filter((value) => UUID_RE.test(value)),
      ),
    ];
    if (ids.length === 0) {
      return { items: [] };
    }
    const [orders, receipts, openingDebts] = await Promise.all([
      this.prisma.client.saleOrder.findMany({
        where: { customerId: { in: ids }, deletedAt: null },
        select: {
          customerId: true,
          totalAmount: true,
          settlementMode: true,
          receivedAmount: true,
        },
      }),
      this.prisma.client.financeCashEntry.groupBy({
        by: ['customerId'],
        where: {
          customerId: { in: ids },
          direction: 'IN',
          category: 'SALES_RECEIPT',
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
      this.customerService.findOpeningDebts(ids),
    ]);
    // 现结单按实收计累计销售，赊销单按合计；现结后欠款为 0（抹零不留下尾差）
    const salesMap = new Map<string, string[]>();
    for (const order of orders) {
      const amount =
        order.settlementMode === 'SETTLED' ? money(order.receivedAmount) : money(order.totalAmount);
      const list = salesMap.get(order.customerId) ?? [];
      list.push(amount);
      salesMap.set(order.customerId, list);
    }
    const receiptMap = new Map(
      receipts.map((row) => [row.customerId, money(row._sum.amount ?? '0')]),
    );
    return {
      items: ids.map((customerId) => {
        const openingDebt = openingDebts.get(customerId) ?? '0.00';
        const salesAmount = sumMoney(salesMap.get(customerId) ?? []);
        const receiptAmount = receiptMap.get(customerId) ?? '0.00';
        return {
          customerId,
          openingDebt,
          sales: salesAmount,
          receipts: receiptAmount,
          outstanding: calcReceivable([salesAmount], [receiptAmount], openingDebt),
        };
      }),
    };
  }

  // 应付：应付 = 期初应付 + 累计采购 − 累计付款（负数为预付）。
  // 采购合计对 purchase 域表只读聚合；累计付款只取挂该供应商的采购付款流水。
  async payables(query: FinancePayablesQuery): Promise<FinancePayableListDto> {
    const ids = [
      ...new Set(
        query.supplierIds
          .split(',')
          .map((value) => value.trim())
          .filter((value) => UUID_RE.test(value)),
      ),
    ];
    if (ids.length === 0) {
      return { items: [] };
    }
    const [purchases, payments, openingPayables] = await Promise.all([
      this.prisma.client.purchaseOrder.findMany({
        where: { supplierId: { in: ids }, deletedAt: null },
        select: {
          supplierId: true,
          totalAmount: true,
          settlementMode: true,
          paidAmount: true,
        },
      }),
      this.prisma.client.financeCashEntry.groupBy({
        by: ['supplierId'],
        where: {
          supplierId: { in: ids },
          direction: 'OUT',
          category: 'PURCHASE_PAYMENT',
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
      this.supplierService.findOpeningPayables(ids),
    ]);
    // 现结单按实付计累计采购，赊购单按合计；现结后应付为 0（折让不留下尾差）
    const purchaseMap = new Map<string, string[]>();
    for (const purchase of purchases) {
      const amount = money(
        purchase.settlementMode === 'SETTLED'
          ? purchase.paidAmount ?? '0'
          : purchase.totalAmount,
      );
      const list = purchaseMap.get(purchase.supplierId) ?? [];
      list.push(amount);
      purchaseMap.set(purchase.supplierId, list);
    }
    const paymentMap = new Map(
      payments.map((row) => [row.supplierId, money(row._sum.amount ?? '0')]),
    );
    return {
      items: ids.map((supplierId) => {
        const openingPayable = openingPayables.get(supplierId) ?? '0.00';
        const purchaseAmount = sumMoney(purchaseMap.get(supplierId) ?? []);
        const paymentAmount = paymentMap.get(supplierId) ?? '0.00';
        return {
          supplierId,
          openingPayable,
          purchases: purchaseAmount,
          payments: paymentAmount,
          outstanding: calcPayable([purchaseAmount], [paymentAmount], openingPayable),
        };
      }),
    };
  }
}
