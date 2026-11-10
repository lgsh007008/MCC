import { Injectable } from '@nestjs/common';
import { Prisma } from '@mcc/db';
import {
  addAmounts,
  calcLineAmount,
  calcOrderTotals,
  calcVolumeM3,
  sumVolumes,
  type SaleOrderInput,
  type SaleOrderItemInput,
  type SaleOrderItemUpdateInput,
  type SaleOrderListQuery,
  type SaleOrderUpdateInput,
} from '@mcc/shared';
import { problem } from '../../common/http-problem.js';
import { PrismaService } from '../../common/prisma.service.js';
import { CustomerService } from '../customer/index.js';
import type {
  SaleOrderDto,
  SaleOrderItemResponseDto,
  SaleOrderListItemDto,
  SaleOrderListDto,
} from './dto/order.dto.js';

// 单据金额与方量一律以字符串计算（design/order.md §3：纯函数在 @mcc/shared，禁浮点）。
// 落账 Decimal 由字符串构造；展示口径（补零位数）由同一套纯函数归一。

const money = (value: string): string => addAmounts(value, '0.00');
const volume = (value: string): string => sumVolumes([value]);
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
// Prisma 的 Date 列不接受纯日期字符串，取 UTC 午夜构造（业务日期为日历日，读回即原值）
const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const CODE_RETRY_LIMIT = 3;

type RawItem = SaleOrderItemInput | SaleOrderItemUpdateInput;

interface ComputedItem {
  productType: 'SQUARE_TIMBER';
  pricingMode: 'VOLUME' | 'PIECE';
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  pieces: number;
  volumeM3: string;
  price: string;
  lineAmount: string;
  otherAmount: string;
  note: string;
}

// 方量对所有行必算（工资依据）；行金额由计价方式决定（product/order.md R-订单-001）。
function computeItem(raw: RawItem): ComputedItem {
  const volumeM3 = calcVolumeM3(raw.thicknessMm, raw.widthMm, raw.lengthMm, raw.pieces);
  const pricingMode = raw.pricingMode === 'piece' ? 'PIECE' : 'VOLUME';
  return {
    productType: 'SQUARE_TIMBER',
    pricingMode,
    thicknessMm: raw.thicknessMm,
    widthMm: raw.widthMm,
    lengthMm: raw.lengthMm,
    pieces: raw.pieces,
    volumeM3,
    price: money(raw.price),
    lineAmount: calcLineAmount(raw.pricingMode ?? 'volume', volumeM3, raw.pieces, raw.price),
    otherAmount: money(raw.otherAmount),
    note: raw.note,
  };
}

interface ListRow {
  id: string;
  code: string;
  saleDate: Date;
  customerId: string;
  customerName: string;
  totalVolume: Prisma.Decimal;
  subtotalAmount: Prisma.Decimal;
  otherAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  note: string;
}

interface DetailOrder extends ListRow {
  deletedAt: Date | null;
  items: Array<{
    id: string;
    seq: number;
    productType: 'SQUARE_TIMBER';
    pricingMode: 'VOLUME' | 'PIECE';
    thicknessMm: number;
    widthMm: number;
    lengthMm: number;
    pieces: number;
    volumeM3: Prisma.Decimal;
    price: Prisma.Decimal;
    lineAmount: Prisma.Decimal;
    otherAmount: Prisma.Decimal;
    note: string;
  }>;
}

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomerService,
  ) {}

  // 编号：年月（取销售日期）+ 当月流水，如 202611-0001（design/order.md §4）。
  // 事务内取值 + 唯一约束兜底并发，P2002 冲突时重试。
  private nextCode(tx: Prisma.TransactionClient, saleDate: string): Promise<string> {
    const prefix = `${saleDate.slice(0, 4)}${saleDate.slice(5, 7)}`;
    return tx.saleOrder
      .findFirst({
        where: { code: { startsWith: `${prefix}-` } },
        orderBy: { code: 'desc' },
        select: { code: true },
      })
      .then((last) => {
        const seq = last ? Number(last.code.slice(8)) + 1 : 1;
        return `${prefix}-${String(seq).padStart(4, '0')}`;
      });
  }

  private toListItem(row: ListRow): SaleOrderListItemDto {
    return {
      id: row.id,
      code: row.code,
      saleDate: isoDate(row.saleDate),
      customerId: row.customerId,
      customerName: row.customerName,
      totalVolume: volume(row.totalVolume.toString()),
      subtotalAmount: money(row.subtotalAmount.toString()),
      otherAmount: money(row.otherAmount.toString()),
      totalAmount: money(row.totalAmount.toString()),
      note: row.note,
    };
  }

  private toItemDto(order: ListRow, item: DetailOrder['items'][number]): SaleOrderItemResponseDto {
    return {
      id: item.id,
      seq: item.seq,
      code: `${order.code}-${String(item.seq).padStart(2, '0')}`,
      productType: 'square_timber',
      pricingMode: item.pricingMode === 'PIECE' ? 'piece' : 'volume',
      thicknessMm: item.thicknessMm,
      widthMm: item.widthMm,
      lengthMm: item.lengthMm,
      pieces: item.pieces,
      volumeM3: volume(item.volumeM3.toString()),
      price: money(item.price.toString()),
      lineAmount: money(item.lineAmount.toString()),
      otherAmount: money(item.otherAmount.toString()),
      note: item.note,
    };
  }

  async list(query: SaleOrderListQuery): Promise<SaleOrderListDto> {
    const where: Prisma.SaleOrderWhereInput = {};
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.dateFrom || query.dateTo) {
      where.saleDate = {};
      if (query.dateFrom) {
        where.saleDate.gte = toDate(query.dateFrom);
      }
      if (query.dateTo) {
        where.saleDate.lte = toDate(query.dateTo);
      }
    }
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.SaleOrderOrderByWithRelationInput[] = [];
    if (query.sortBy === 'totalVolume') {
      orderBy.push({ totalVolume: sortOrder });
    } else if (query.sortBy === 'totalAmount') {
      orderBy.push({ totalAmount: sortOrder });
    } else {
      orderBy.push({ saleDate: sortOrder });
    }
    orderBy.push({ createdAt: 'desc' });
    const [total, rows, sums] = await Promise.all([
      this.prisma.client.saleOrder.count({ where }),
      this.prisma.client.saleOrder.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          code: true,
          saleDate: true,
          customerId: true,
          customerName: true,
          totalVolume: true,
          subtotalAmount: true,
          otherAmount: true,
          totalAmount: true,
          note: true,
        },
      }),
      // 合计行：对筛选全量 aggregate（排除分页），由接口返回而非前端本地加（页面模式规范）
      this.prisma.client.saleOrder.aggregate({
        where,
        _sum: {
          totalVolume: true,
          subtotalAmount: true,
          otherAmount: true,
          totalAmount: true,
        },
      }),
    ]);
    return {
      total,
      summary: {
        totalVolume: volume(sums._sum.totalVolume?.toString() ?? '0'),
        subtotalAmount: money(sums._sum.subtotalAmount?.toString() ?? '0'),
        otherAmount: money(sums._sum.otherAmount?.toString() ?? '0'),
        totalAmount: money(sums._sum.totalAmount?.toString() ?? '0'),
      },
      items: rows.map((row) => this.toListItem(row)),
    };
  }

  async detail(id: string): Promise<SaleOrderDto> {
    const order = await this.prisma.client.saleOrder.findUnique({
      where: { id },
      include: {
        items: { where: { deletedAt: null }, orderBy: { seq: 'asc' } },
      },
    });
    if (!order || order.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '销售单不存在');
    }
    // 客户编号取自客户档案当前记录（经公开接口，不读 customer 表）；名称仍用单据上的快照。
    const customer = await this.customers.findById(order.customerId);
    return {
      ...this.toListItem(order),
      customerCode: customer?.code ?? null,
      customerDeleted: customer?.deleted ?? false,
      items: order.items.map((item) => this.toItemDto(order, item)),
    };
  }

  async create(input: SaleOrderInput): Promise<SaleOrderDto> {
    // 客户校验经 customer 公开接口（design/order.md §5）：存在且启用才可开单。
    const customer = await this.customers.assertSelectable(input.customerId);
    const computed = input.items.map((item) => computeItem(item));
    const totals = calcOrderTotals(
      computed.map((item) => ({
        volumeM3: item.volumeM3,
        lineAmount: item.lineAmount,
        otherAmount: item.otherAmount,
      })),
      money(input.otherAmount),
    );

    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt++) {
      try {
        const order = await this.prisma.client.$transaction(async (tx) => {
          const code = await this.nextCode(tx, input.saleDate);
          const created = await tx.saleOrder.create({
            data: {
              code,
              saleDate: toDate(input.saleDate),
              customerId: customer.id,
              customerName: customer.name,
              totalVolume: totals.totalVolume,
              subtotalAmount: totals.subtotalAmount,
              otherAmount: money(input.otherAmount),
              totalAmount: totals.totalAmount,
              note: input.note,
            },
          });
          await tx.saleOrderItem.createMany({
            data: computed.map((item, index) => ({
              orderId: created.id,
              seq: index + 1,
              productType: item.productType,
              pricingMode: item.pricingMode,
              thicknessMm: item.thicknessMm,
              widthMm: item.widthMm,
              lengthMm: item.lengthMm,
              pieces: item.pieces,
              volumeM3: item.volumeM3,
              price: item.price,
              lineAmount: item.lineAmount,
              otherAmount: item.otherAmount,
              note: item.note,
            })),
          });
          return created;
        });
        return this.detail(order.id);
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

  async update(id: string, input: SaleOrderUpdateInput): Promise<SaleOrderDto> {
    const existing = await this.prisma.client.saleOrder.findUnique({
      where: { id },
      // 租户扩展的 findUnique 钩子按 tenantId 校验归属，select 必须带出该列，否则异租户误判
      select: { id: true, deletedAt: true, tenantId: true, customerId: true, customerName: true },
    });
    if (!existing || existing.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '销售单不存在');
    }

    // 客户未变更时不校验启用态（历史单客户可能已停用，仍需可保存）；变更客户则要求启用并重取名称快照。
    const customer =
      existing.customerId === input.customerId
        ? { id: existing.customerId, name: existing.customerName }
        : await this.customers.assertSelectable(input.customerId);

    const computed = input.items.map((item) => computeItem(item));
    const totals = calcOrderTotals(
      computed.map((item) => ({
        volumeM3: item.volumeM3,
        lineAmount: item.lineAmount,
        otherAmount: item.otherAmount,
      })),
      money(input.otherAmount),
    );

    const itemData = (item: ComputedItem) => ({
      productType: item.productType,
      pricingMode: item.pricingMode,
      thicknessMm: item.thicknessMm,
      widthMm: item.widthMm,
      lengthMm: item.lengthMm,
      pieces: item.pieces,
      volumeM3: item.volumeM3,
      price: item.price,
      lineAmount: item.lineAmount,
      otherAmount: item.otherAmount,
      note: item.note,
    });

    await this.prisma.client.$transaction(async (tx) => {
      await tx.saleOrder.updateMany({
        where: { id },
        data: {
          saleDate: toDate(input.saleDate),
          customerId: customer.id,
          customerName: customer.name,
          totalVolume: totals.totalVolume,
          subtotalAmount: totals.subtotalAmount,
          otherAmount: money(input.otherAmount),
          totalAmount: totals.totalAmount,
          note: input.note,
        },
      });

      // 明细同步：已有行按 id 原位更新；新行追加行序；被移除的行软删（行序作废、不回改不重排）
      const allItems = await tx.saleOrderItem.findMany({
        where: { orderId: id },
        select: { id: true, seq: true },
      });
      let nextSeq = allItems.reduce((max, row) => Math.max(max, row.seq), 0);
      const existingIds = new Set(allItems.map((row) => row.id));
      const keepIds = new Set<string>();
      for (const item of input.items) {
        const computedItem = computeItem(item);
        if (item.id && existingIds.has(item.id)) {
          keepIds.add(item.id);
          await tx.saleOrderItem.updateMany({
            where: { id: item.id, orderId: id },
            data: itemData(computedItem),
          });
        } else {
          nextSeq += 1;
          await tx.saleOrderItem.create({
            data: { orderId: id, seq: nextSeq, ...itemData(computedItem) },
          });
        }
      }
      const removeIds = [...existingIds].filter((itemId) => !keepIds.has(itemId));
      if (removeIds.length > 0) {
        await tx.saleOrderItem.updateMany({
          where: { id: { in: removeIds } },
          data: { deletedAt: new Date() },
        });
      }
    });

    return this.detail(id);
  }

  // 客户维度累计方量（product/customer.md 累计下单方量；design/order.md §5）：
  // 未软删销售单按 customer_id 汇总；每一行都有方量（工资依据），不再有「其他」类型例外。
  // 用 findMany 后本地汇总而非 groupBy：租户条件由数据访问层统一附加，groupBy 不在扩展钩子内。
  async customerVolumeSummary(customerIds: string[]): Promise<{
    items: Array<{ customerId: string; totalVolume: string; orderCount: number }>;
  }> {
    const rows = await this.prisma.client.saleOrder.findMany({
      where: { deletedAt: null, customerId: { in: customerIds } },
      select: { customerId: true, totalVolume: true },
    });
    const buckets = new Map<string, { volumes: string[]; count: number }>();
    for (const row of rows) {
      const bucket = buckets.get(row.customerId) ?? { volumes: [], count: 0 };
      bucket.volumes.push(row.totalVolume.toString());
      bucket.count += 1;
      buckets.set(row.customerId, bucket);
    }
    return {
      items: customerIds.map((customerId) => {
        const bucket = buckets.get(customerId);
        return {
          customerId,
          totalVolume: sumVolumes(bucket?.volumes ?? []),
          orderCount: bucket?.count ?? 0,
        };
      }),
    };
  }

  // 删除 = 软删除（技术方案 §5.1）：编号不回收，列表默认不可见
  async remove(id: string): Promise<void> {
    const result = await this.prisma.client.saleOrder.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw problem(404, 'NOT_FOUND', '销售单不存在');
    }
  }

  // 批量删除：仅命中未删行，不存在 / 已删行静默跳过（页面模式规范：多选 + 批量操作）
  async removeMany(ids: string[]): Promise<{ deleted: number }> {
    const result = await this.prisma.client.saleOrder.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count };
  }
}