import { Injectable } from '@nestjs/common';
import { Prisma } from '@mcc/db';
import {
  calcPurchaseSubtotal,
  calcPurchaseTotal,
  sumMoney,
  type PurchaseInput,
  type PurchaseListQuery,
  type PurchaseSupplierSummaryQuery,
} from '@mcc/shared';
import { problem } from '../../common/http-problem.js';
import { PrismaService } from '../../common/prisma.service.js';
import { FinanceService } from '../finance/index.js';
import { SupplierService } from '../supplier/index.js';
import type { PurchaseOrderDto, PurchaseOrderListDto } from './dto/purchase.dto.js';

// 原木采购单（product/purchase.md R-采购-001；design/purchase.md）。
// 单头单据，无明细；金额保存时按结算吨数重算落账。
// 现结在同事务内派生财务付款流水；赊购不派生，改删同步源单流水。

const CODE_RETRY_LIMIT = 3;
const CODE_PREFIX = 'PO-';
const CODE_PAD = 5;

const money = (value: string | Prisma.Decimal): string => sumMoney([value.toString()]);
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

interface PurchaseRow {
  id: string;
  code: string;
  purchaseDate: Date;
  supplierId: string;
  supplierName: string;
  deliveredTons: Prisma.Decimal;
  settledTons: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  subtotalAmount: Prisma.Decimal;
  otherAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  settlementMode: 'CREDIT' | 'SETTLED';
  settleAccountId: string | null;
  paidAmount: Prisma.Decimal | null;
  note: string;
  createdAt: Date;
}

const toDto = (row: PurchaseRow): PurchaseOrderDto => ({
  id: row.id,
  code: row.code,
  purchaseDate: isoDate(row.purchaseDate),
  supplierId: row.supplierId,
  supplierName: row.supplierName,
  deliveredTons: row.deliveredTons.toFixed(3),
  settledTons: row.settledTons.toFixed(3),
  unitPrice: money(row.unitPrice),
  subtotalAmount: money(row.subtotalAmount),
  otherAmount: money(row.otherAmount),
  totalAmount: money(row.totalAmount),
  settlementMode: row.settlementMode === 'SETTLED' ? 'settled' : 'credit',
  settleAccountId: row.settleAccountId,
  paidAmount: row.paidAmount === null ? null : money(row.paidAmount),
  note: row.note,
  createdAt: isoDate(row.createdAt),
});

const PURCHASE_SELECT = {
  id: true,
  code: true,
  purchaseDate: true,
  supplierId: true,
  supplierName: true,
  deliveredTons: true,
  settledTons: true,
  unitPrice: true,
  subtotalAmount: true,
  otherAmount: true,
  totalAmount: true,
  settlementMode: true,
  settleAccountId: true,
  paidAmount: true,
  note: true,
  createdAt: true,
} satisfies Prisma.PurchaseOrderSelect;

@Injectable()
export class PurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppliers: SupplierService,
    private readonly finance: FinanceService,
  ) {}

  private nextCode(tx: Prisma.TransactionClient): Promise<string> {
    return tx.purchaseOrder
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

  async list(query: PurchaseListQuery): Promise<PurchaseOrderListDto> {
    const where: Prisma.PurchaseOrderWhereInput = { deletedAt: null };
    if (query.code) {
      where.code = { contains: query.code };
    }
    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }
    // 名称快照模糊查询（与销售单 customerName 同构；移动端搜索用）
    if (query.supplierName) {
      where.supplierName = { contains: query.supplierName };
    }
    if (query.settlementMode) {
      where.settlementMode = query.settlementMode === 'settled' ? 'SETTLED' : 'CREDIT';
    }
    if (query.dateFrom || query.dateTo) {
      where.purchaseDate = {};
      if (query.dateFrom) {
        where.purchaseDate.gte = toDate(query.dateFrom);
      }
      if (query.dateTo) {
        where.purchaseDate.lte = toDate(query.dateTo);
      }
    }
    // 排序（页面模式规范：表头正/倒序）；createdAt 作次级排序保证翻页稳定
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.PurchaseOrderOrderByWithRelationInput[] = [];
    if (query.sortBy === 'totalAmount') {
      orderBy.push({ totalAmount: sortOrder });
    } else {
      orderBy.push({ purchaseDate: sortOrder });
    }
    orderBy.push({ createdAt: 'desc' });
    const [total, rows, sums] = await Promise.all([
      this.prisma.client.purchaseOrder.count({ where }),
      this.prisma.client.purchaseOrder.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: PURCHASE_SELECT,
      }),
      this.prisma.client.purchaseOrder.aggregate({
        where,
        _sum: { totalAmount: true },
      }),
    ]);
    return {
      total,
      summary: { totalAmount: money(sums._sum.totalAmount ?? '0') },
      items: rows.map((row) => toDto(row)),
    };
  }

  async detail(id: string): Promise<PurchaseOrderDto> {
    const row = await this.prisma.client.purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      select: PURCHASE_SELECT,
    });
    if (!row) {
      throw problem(404, 'NOT_FOUND', '采购单不存在');
    }
    return toDto(row);
  }

  async create(input: PurchaseInput): Promise<PurchaseOrderDto> {
    // 供应商校验经 supplier 公开接口（design/purchase.md §8）：存在且启用才可开单。
    const supplier = await this.suppliers.assertSelectable(input.supplierId);
    const subtotal = calcPurchaseSubtotal(input.settledTons, input.unitPrice);
    const total = calcPurchaseTotal(subtotal, input.otherAmount);

    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt++) {
      try {
        const created = await this.prisma.client.$transaction(async (tx) => {
          const code = await this.nextCode(tx);
          const settled = input.settlementMode === 'settled';
          const paidAmount = settled ? input.paidAmount ?? total : null;
          const row = await tx.purchaseOrder.create({
            data: {
              code,
              purchaseDate: toDate(input.purchaseDate),
              supplierId: supplier.id,
              supplierName: supplier.name,
              deliveredTons: input.deliveredTons,
              settledTons: input.settledTons,
              unitPrice: input.unitPrice,
              subtotalAmount: subtotal,
              otherAmount: input.otherAmount,
              totalAmount: total,
              settlementMode: settled ? 'SETTLED' : 'CREDIT',
              settleAccountId: settled ? input.settleAccountId ?? null : null,
              paidAmount,
              note: input.note,
            },
            select: { id: true },
          });
          // 财务联动（design/finance.md §6）：仅现结时同事务生成付款流水，失败则整单回滚
          if (settled && input.settleAccountId && paidAmount !== null) {
            await this.finance.syncSourceCashEntry(tx, {
              sourceType: 'purchase_order',
              sourceId: row.id,
              sourceCode: code,
              direction: 'out',
              category: 'purchase_payment',
              occurredDate: input.purchaseDate,
              amount: paidAmount,
              accountId: input.settleAccountId,
              supplierId: supplier.id,
              supplierName: supplier.name,
              note: `采购单 ${code}`,
            });
          }
          return row;
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

  async update(id: string, input: PurchaseInput): Promise<PurchaseOrderDto> {
    const existing = await this.prisma.client.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        deletedAt: true,
        tenantId: true,
        supplierId: true,
        supplierName: true,
      },
    });
    if (!existing || existing.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '采购单不存在');
    }

    // 供应商未变更时不校验启用态（历史单供应商可能已停用，仍需可保存）；变更则要求启用并重取快照。
    const supplier =
      existing.supplierId === input.supplierId
        ? { id: existing.supplierId, name: existing.supplierName }
        : await this.suppliers.assertSelectable(input.supplierId);

    const subtotal = calcPurchaseSubtotal(input.settledTons, input.unitPrice);
    const total = calcPurchaseTotal(subtotal, input.otherAmount);

    await this.prisma.client.$transaction(async (tx) => {
      const settled = input.settlementMode === 'settled';
      const paidAmount = settled ? input.paidAmount ?? total : null;
      await tx.purchaseOrder.updateMany({
        where: { id, deletedAt: null },
        data: {
          purchaseDate: toDate(input.purchaseDate),
          supplierId: supplier.id,
          supplierName: supplier.name,
          deliveredTons: input.deliveredTons,
          settledTons: input.settledTons,
          unitPrice: input.unitPrice,
          subtotalAmount: subtotal,
          otherAmount: input.otherAmount,
          totalAmount: total,
          settlementMode: settled ? 'SETTLED' : 'CREDIT',
          settleAccountId: settled ? input.settleAccountId ?? null : null,
          paidAmount,
          note: input.note,
        },
      });
      // 财务联动：现结同步付款流水，改为赊购则软删
      if (settled && input.settleAccountId && paidAmount !== null) {
        await this.finance.syncSourceCashEntry(tx, {
          sourceType: 'purchase_order',
          sourceId: id,
          sourceCode: existing.code,
          direction: 'out',
          category: 'purchase_payment',
          occurredDate: input.purchaseDate,
          amount: paidAmount,
          accountId: input.settleAccountId,
          supplierId: supplier.id,
          supplierName: supplier.name,
          note: `采购单 ${existing.code}`,
        });
      } else {
        await this.finance.removeSourceCashEntries(tx, 'purchase_order', [id]);
      }
    });

    return this.detail(id);
  }

  // 删除 = 软删除：编号不回收，派生付款流水一并软删、余额回退（同事务）
  async remove(id: string): Promise<void> {
    const result = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (updated.count > 0) {
        await this.finance.removeSourceCashEntries(tx, 'purchase_order', [id]);
      }
      return updated;
    });
    if (result.count === 0) {
      throw problem(404, 'NOT_FOUND', '采购单不存在');
    }
  }

  // 批量删除：仅命中未删行，不存在 / 已删行静默跳过；派生付款流水一并软删（同事务）
  async removeMany(ids: string[]): Promise<{ deleted: number }> {
    return this.prisma.client.$transaction(async (tx) => {
      const targets = await tx.purchaseOrder.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true },
      });
      if (targets.length === 0) {
        return { deleted: 0 };
      }
      const targetIds = targets.map((row) => row.id);
      const result = await tx.purchaseOrder.updateMany({
        where: { id: { in: targetIds } },
        data: { deletedAt: new Date() },
      });
      await this.finance.removeSourceCashEntries(tx, 'purchase_order', targetIds);
      return { deleted: result.count };
    });
  }

  // 供应商维度采购单数（供供应商删除确认文案）：未软删采购单按 supplier_id 汇总。
  async supplierSummary(query: PurchaseSupplierSummaryQuery): Promise<{
    items: Array<{ supplierId: string; purchaseCount: number }>;
  }> {
    const ids = [...new Set(query.supplierIds.split(',').map((value) => value.trim()).filter(Boolean))];
    if (ids.length === 0) {
      return { items: [] };
    }
    const rows = await this.prisma.client.purchaseOrder.findMany({
      where: { deletedAt: null, supplierId: { in: ids } },
      select: { supplierId: true },
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.supplierId, (counts.get(row.supplierId) ?? 0) + 1);
    }
    return {
      items: ids.map((supplierId) => ({ supplierId, purchaseCount: counts.get(supplierId) ?? 0 })),
    };
  }
}
