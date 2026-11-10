import { Injectable } from '@nestjs/common';
import { Prisma } from '@mcc/db';
import {
  calcFinanceSummary,
  signedAmount,
  sumMoney,
  type FinanceCategory,
  type FinanceEventInput,
  type FinanceEventListQuery,
  type FinanceEventUpdateInput,
  type FinanceSummaryQuery,
} from '@mcc/shared';
import { problem } from '../../common/http-problem.js';
import { PrismaService } from '../../common/prisma.service.js';
import type {
  FinanceEventDto,
  FinanceEventListItemDto,
  FinanceEventListDto,
  FinanceSummaryDto,
} from './dto/finance.dto.js';

// 财务事件（design/finance.md §2 / §3）：
// 金额有符号（收入正、支出负），手工金额按正数提交、落库前按分类规范化；
// 自动事件由订单域在同一事务内写入，财务侧只读。

type DbCategory = 'SALES_REVENUE' | 'OTHER_REVENUE' | 'PURCHASE_COST' | 'LABOR_COST' | 'OTHER_EXPENSE';

const CATEGORY_TO_DB: Record<FinanceCategory, DbCategory> = {
  sales_revenue: 'SALES_REVENUE',
  other_revenue: 'OTHER_REVENUE',
  purchase_cost: 'PURCHASE_COST',
  labor_cost: 'LABOR_COST',
  other_expense: 'OTHER_EXPENSE',
};

const CATEGORY_FROM_DB: Record<DbCategory, FinanceCategory> = {
  SALES_REVENUE: 'sales_revenue',
  OTHER_REVENUE: 'other_revenue',
  PURCHASE_COST: 'purchase_cost',
  LABOR_COST: 'labor_cost',
  OTHER_EXPENSE: 'other_expense',
};

const SOURCE_TO_DB = { auto: 'AUTO', manual: 'MANUAL' } as const;
const SOURCE_FROM_DB = { AUTO: 'auto', MANUAL: 'manual' } as const;

const money = (value: string | Prisma.Decimal): string => sumMoney([value.toString()]);
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const CODE_RETRY_LIMIT = 3;
// 全局编号规范（1-产品文档.md 五）：FN + 连字符 + 5 位全局流水，不含日期
const CODE_PREFIX = 'FN-';
const CODE_PAD = 5;

const AUTO_READONLY = '自动生成的事件不可编辑或删除，请以来源单据为准';

interface EventRow {
  id: string;
  code: string;
  occurredDate: Date;
  category: DbCategory;
  amount: Prisma.Decimal;
  note: string;
  source: 'AUTO' | 'MANUAL';
  sourceType: string | null;
  sourceId: string | null;
  sourceCode: string | null;
}

export interface SaleOrderEventInput {
  orderId: string;
  code: string;
  saleDate: string;
  totalAmount: string;
  customerName: string;
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  // 编号：FN-#####（全局流水，不含日期；design/finance.md §4）；事务内取流水、唯一约束兜底
  private nextCode(tx: Prisma.TransactionClient): Promise<string> {
    return tx.financeEvent
      .findFirst({
        where: { code: { startsWith: CODE_PREFIX } },
        orderBy: { code: 'desc' },
        select: { code: true },
      })
      .then((last) => {
        const seq = last ? Number(last.code.slice(CODE_PREFIX.length)) + 1 : 1;
        return `${CODE_PREFIX}${String(seq).padStart(CODE_PAD, '0')}`;
      });
  }

  private toListItem(row: EventRow): FinanceEventListItemDto {
    return {
      id: row.id,
      code: row.code,
      occurredDate: isoDate(row.occurredDate),
      category: CATEGORY_FROM_DB[row.category],
      amount: money(row.amount),
      note: row.note,
      source: SOURCE_FROM_DB[row.source],
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      sourceCode: row.sourceCode,
    };
  }

  private whereFromQuery(query: FinanceEventListQuery): Prisma.FinanceEventWhereInput {
    const where: Prisma.FinanceEventWhereInput = { deletedAt: null };
    if (query.category) {
      where.category = CATEGORY_TO_DB[query.category];
    }
    if (query.source) {
      where.source = SOURCE_TO_DB[query.source];
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
    return where;
  }

  async list(query: FinanceEventListQuery): Promise<FinanceEventListDto> {
    const where = this.whereFromQuery(query);
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.FinanceEventOrderByWithRelationInput[] = [];
    if (query.sortBy === 'amount') {
      orderBy.push({ amount: sortOrder });
    } else {
      orderBy.push({ occurredDate: sortOrder });
    }
    orderBy.push({ createdAt: 'desc' });
    const [total, rows, sums] = await Promise.all([
      this.prisma.client.financeEvent.count({ where }),
      this.prisma.client.financeEvent.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          code: true,
          occurredDate: true,
          category: true,
          amount: true,
          note: true,
          source: true,
          sourceType: true,
          sourceId: true,
          sourceCode: true,
        },
      }),
      // 合计行：对筛选全量 aggregate（排除分页），由接口返回（页面模式规范）
      this.prisma.client.financeEvent.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      total,
      summary: { amount: money(sums._sum.amount ?? '0') },
      items: rows.map((row) => this.toListItem(row)),
    };
  }

  async detail(id: string): Promise<FinanceEventDto> {
    const row = await this.prisma.client.financeEvent.findUnique({
      where: { id },
      // 租户扩展的 findUnique 钩子按 tenantId 校验归属，select 必须带出该列
      select: {
        id: true,
        tenantId: true,
        deletedAt: true,
        code: true,
        occurredDate: true,
        category: true,
        amount: true,
        note: true,
        source: true,
        sourceType: true,
        sourceId: true,
        sourceCode: true,
      },
    });
    if (!row || row.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '事件不存在');
    }
    return this.toListItem(row);
  }

  async create(input: FinanceEventInput): Promise<FinanceEventDto> {
    const amount = signedAmount(input.category, input.amount);
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt++) {
      try {
        const created = await this.prisma.client.$transaction(async (tx) => {
          const code = await this.nextCode(tx);
          return tx.financeEvent.create({
            data: {
              code,
              occurredDate: toDate(input.occurredDate),
              category: CATEGORY_TO_DB[input.category],
              amount,
              note: input.note,
              source: 'MANUAL',
            },
          });
        });
        return this.detail(created.id);
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

  async update(id: string, input: FinanceEventUpdateInput): Promise<FinanceEventDto> {
    const existing = await this.prisma.client.financeEvent.findUnique({
      where: { id },
      select: { id: true, tenantId: true, deletedAt: true, source: true },
    });
    if (!existing || existing.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '事件不存在');
    }
    if (existing.source !== 'MANUAL') {
      throw problem(400, 'AUTO_EVENT_READONLY', AUTO_READONLY);
    }
    await this.prisma.client.financeEvent.updateMany({
      where: { id, source: 'MANUAL', deletedAt: null },
      data: {
        occurredDate: toDate(input.occurredDate),
        category: CATEGORY_TO_DB[input.category],
        amount: signedAmount(input.category, input.amount),
        note: input.note,
      },
    });
    return this.detail(id);
  }

  // 删除 = 软删除；自动事件拒绝（以来源单据为准）
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.client.financeEvent.findUnique({
      where: { id },
      select: { id: true, tenantId: true, deletedAt: true, source: true },
    });
    if (!existing || existing.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '事件不存在');
    }
    if (existing.source !== 'MANUAL') {
      throw problem(400, 'AUTO_EVENT_READONLY', AUTO_READONLY);
    }
    await this.prisma.client.financeEvent.updateMany({
      where: { id, source: 'MANUAL', deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  // 批量删除：仅手工事件，不存在 / 已删 / 自动事件静默跳过
  async removeMany(ids: string[]): Promise<{ deleted: number }> {
    const result = await this.prisma.client.financeEvent.updateMany({
      where: { id: { in: ids }, source: 'MANUAL', deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count };
  }

  // 收支汇总：按日期区间实时聚合（不落库、不存快照）
  async summary(query: FinanceSummaryQuery): Promise<FinanceSummaryDto> {
    const where: Prisma.FinanceEventWhereInput = { deletedAt: null };
    if (query.dateFrom || query.dateTo) {
      where.occurredDate = {};
      if (query.dateFrom) {
        where.occurredDate.gte = toDate(query.dateFrom);
      }
      if (query.dateTo) {
        where.occurredDate.lte = toDate(query.dateTo);
      }
    }
    const rows = await this.prisma.client.financeEvent.findMany({
      where,
      select: { category: true, amount: true },
    });
    const summary = calcFinanceSummary(
      rows.map((row) => ({
        category: CATEGORY_FROM_DB[row.category],
        amount: money(row.amount),
      })),
    );
    return {
      totalIncome: summary.totalIncome,
      totalCost: summary.totalCost,
      netProfit: summary.netProfit,
      eventCount: rows.length,
      categories: summary.byCategory,
    };
  }

  // ── 订单域联动（design/finance.md §6）：由 order 在同一事务内调用 ──

  private saleOrderNote(input: SaleOrderEventInput): string {
    return `销售单 ${input.code}${input.customerName ? ` · ${input.customerName}` : ''}`;
  }

  // 销售单创建 / 编辑：按源单定位事件并同步日期、金额、备注；缺失则补建（容错）
  async syncSaleOrderEvent(
    tx: Prisma.TransactionClient,
    input: SaleOrderEventInput,
  ): Promise<void> {
    const note = this.saleOrderNote(input);
    const existing = await tx.financeEvent.findFirst({
      where: { sourceType: 'sale_order', sourceId: input.orderId },
      select: { id: true },
    });
    if (existing) {
      await tx.financeEvent.updateMany({
        where: { id: existing.id },
        data: {
          occurredDate: toDate(input.saleDate),
          amount: money(input.totalAmount),
          sourceCode: input.code,
          note,
        },
      });
      return;
    }
    const code = await this.nextCode(tx);
    await tx.financeEvent.create({
      data: {
        code,
        occurredDate: toDate(input.saleDate),
        category: 'SALES_REVENUE',
        amount: money(input.totalAmount),
        note,
        source: 'AUTO',
        sourceType: 'sale_order',
        sourceId: input.orderId,
        sourceCode: input.code,
      },
    });
  }

  // 销售单删除（含批量）：对应自动事件一并软删
  async syncSaleOrderRemoval(tx: Prisma.TransactionClient, orderIds: string[]): Promise<void> {
    if (orderIds.length === 0) {
      return;
    }
    await tx.financeEvent.updateMany({
      where: { sourceType: 'sale_order', sourceId: { in: orderIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
