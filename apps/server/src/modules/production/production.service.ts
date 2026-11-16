import { Injectable } from '@nestjs/common';
import { Prisma } from '@mcc/db';
import {
  calcInventoryTotalAmount,
  calcMaterialCostAmount,
  calcTimberSaleCost,
  calcVolumeM3,
  divRoundHalfUp,
  foldInventoryEvents,
  fromScaled,
  sumVolumes,
  toScaled,
  type InventoryCountInput,
  type InventoryCountListQuery,
  type InventoryEvent,
  type InventoryOpeningInput,
  type IssueSettlement,
  type MaterialIssueInput,
  type MaterialIssueListQuery,
  type MaterialIssueUpdateInput,
  type OutputSettlement,
  type ProductionBatchInput,
  type ProductionBatchListQuery,
  type ProductionBatchUpdateInput,
  type ProductionOutputInput,
  type ProductionOutputListQuery,
  type ProductionOutputUpdateInput,
  type SaleCostLayer,
} from '@mcc/shared';
import { problem } from '../../common/http-problem.js';
import { PrismaService } from '../../common/prisma.service.js';
import { currentTenantId } from '../../common/prisma-tenant.extension.js';
import type {
  InventoryAdjustmentItemDto,
  InventoryAdjustmentResultDto,
  InventoryBatchDto,
  InventoryCountDetailDto,
  InventoryCountListDto,
  InventoryOpeningDetailDto,
  InventorySummaryDto,
  InventoryTimberLineDto,
} from './dto/inventory.dto.js';
import type {
  MaterialIssueDto,
  MaterialIssueListDto,
  ProductionBatchDetailDto,
  ProductionBatchDto,
  ProductionBatchIssueDto,
  ProductionBatchListDto,
  ProductionBatchOutputDto,
  ProductionBatchTimberLineDto,
  ProductionOutputDto,
  ProductionOutputLineDto,
  ProductionOutputListItemDto,
  ProductionOutputListDto,
} from './dto/production.dto.js';

const CODE_RETRY_LIMIT = 3;
const ISSUE_PREFIX = 'MI-';
const OUTPUT_PREFIX = 'PR-';
const ADJUSTMENT_PREFIX = 'IC-';
const BATCH_PREFIX = 'BT-';
const CODE_PAD = 5;

type BatchRow = Prisma.ProductionBatchGetPayload<Record<string, never>>;
type IssueRow = Prisma.MaterialIssueGetPayload<{ include: { batch: true } }>;
type OutputWithLines = Prisma.ProductionOutputGetPayload<{
  include: { lines: true; batch: true };
}>;
type OutputListRow = Prisma.ProductionOutputGetPayload<{
  include: { lines: { select: { volumeM3: true } }; batch: true };
}>;
type OpeningRow = Prisma.InventoryAdjustmentGetPayload<{ include: { items: true } }>;

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);
const toDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const tons = (value: string | Prisma.Decimal): string => fromScaled(toScaled(value.toString(), 3), 3);
const volume = (value: string | Prisma.Decimal): string =>
  fromScaled(toScaled(value.toString(), 4), 4);
const money = (value: string | Prisma.Decimal): string =>
  fromScaled(toScaled(value.toString(), 2), 2);
const cost6 = (value: string | Prisma.Decimal): string =>
  fromScaled(toScaled(value.toString(), 6), 6);

const timberKey = (lengthMm: number, widthMm: number, heightMm: number): string =>
  `${lengthMm}x${widthMm}x${heightMm}`;

const isNegative = (value: string): boolean => value.startsWith('-');
const isNegativeOrZero = (value: string): boolean => toScaled(value, 4) <= 0n;

function diffQuantity(actual: string, book: string, scale: 3 | 4): string {
  return fromScaled(toScaled(actual, scale) - toScaled(book, scale), scale);
}

function dateFilterFrom(query: { dateFrom?: string; dateTo?: string }): Prisma.DateTimeFilter | undefined {
  if (!query.dateFrom && !query.dateTo) {
    return undefined;
  }
  const filter: Prisma.DateTimeFilter = {};
  if (query.dateFrom) {
    filter.gte = toDate(query.dateFrom);
  }
  if (query.dateTo) {
    filter.lte = toDate(query.dateTo);
  }
  return filter;
}

interface AdjustmentOperator {
  id: string;
  name: string;
}

const EMPTY_SUMMARY: InventorySummaryDto = {
  needsOpening: true,
  openingDate: null,
  raw: { quantity: '0.000', unitCost: '0.000000', amount: '0.00', negative: false },
  timber: { quantity: '0.0000', unitCost: '0.000000', amount: '0.00', negative: false },
  timberLines: [],
  batches: [],
  shortfallVolume: '0.0000',
  shortfallAmount: '0.00',
  totalAmount: '0.00',
  pendingAmount: '0.00',
  pendingIssueCount: 0,
  earliestPendingIssueCode: null,
  earliestPendingIssueDate: null,
  negativeLineCount: 0,
};

@Injectable()
export class ProductionService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 原木领用 ─────────────────────────────────────────────

  private toString(value: Prisma.Decimal | null | undefined): string {
    return value?.toString() ?? '0';
  }

  private toIssueDto(
    row: IssueRow,
    settlement?: IssueSettlement,
  ): MaterialIssueDto {
    const settled = settlement?.settled ?? '0.00';
    const remaining = settlement?.remaining ?? '0.00';
    return {
      id: row.id,
      code: row.code,
      issueDate: isoDate(row.issueDate),
      tons: tons(row.tons),
      note: row.note,
      // 结转状态只用于追溯：待结转 = 仍有未转入方木池的成本
      settlementStatus: remaining === '0.00' ? 'settled' : 'pending',
      settledAmount: settled,
      pendingAmount: remaining,
      settledByCodes: settlement?.settledBy ?? [],
      batchId: row.batchId,
      batchCode: row.batch.code,
      batchStatus: row.batch.status === 'OPEN' ? 'open' : 'closed',
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async nextIssueCode(tx: Prisma.TransactionClient): Promise<string> {
    const last = await tx.materialIssue.findFirst({
      where: { code: { startsWith: ISSUE_PREFIX } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const seq = last ? Number(last.code.slice(ISSUE_PREFIX.length)) + 1 : 1;
    return `${ISSUE_PREFIX}${String(seq).padStart(CODE_PAD, '0')}`;
  }

  // 逐单归属：与库存汇总共用同一份事件流，按「最早未结转的先结转」推导（只用于追溯）
  private async settlementMaps(): Promise<{
    issues: Map<string, IssueSettlement>;
    outputs: Map<string, OutputSettlement>;
    pending: IssueSettlement[];
  }> {
    const { events } = await this.buildInventoryEvents();
    const pool = foldInventoryEvents(events);
    return {
      issues: new Map(pool.issueSettlements.map((item) => [item.ref, item])),
      outputs: new Map(pool.outputSettlements.map((item) => [item.ref, item])),
      pending: pool.issueSettlements.filter((item) => item.remaining !== '0.00'),
    };
  }

  async listIssues(query: MaterialIssueListQuery): Promise<MaterialIssueListDto> {
    const where: Prisma.MaterialIssueWhereInput = { deletedAt: null };
    const dateFilter = dateFilterFrom(query);
    if (dateFilter) {
      where.issueDate = dateFilter;
    }
    if (query.batchId) {
      where.batchId = query.batchId;
    }
    const maps = await this.settlementMaps();
    if (query.settlementStatus) {
      const wantPending = query.settlementStatus === 'pending';
      where.code = {
        in: [...maps.issues.entries()]
          .filter(([, item]) => (item.remaining !== '0.00') === wantPending)
          .map(([code]) => code),
      };
    }
    const [total, rows, sum] = await Promise.all([
      this.prisma.client.materialIssue.count({ where }),
      this.prisma.client.materialIssue.findMany({
        where,
        orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { batch: true },
      }),
      this.prisma.client.materialIssue.aggregate({ where, _sum: { tons: true } }),
    ]);
    return {
      total,
      summary: { tons: tons(this.toString(sum._sum.tons)) },
      items: rows.map((row) => this.toIssueDto(row, maps.issues.get(row.code))),
    };
  }

  async issueDetail(id: string): Promise<MaterialIssueDto> {
    const row = await this.prisma.client.materialIssue.findUnique({
      where: { id },
      include: { batch: true },
    });
    if (!row || row.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '原木领用单不存在');
    }
    const maps = await this.settlementMaps();
    return this.toIssueDto(row, maps.issues.get(row.code));
  }

  async createIssue(input: MaterialIssueInput): Promise<MaterialIssueDto> {
    await this.assertOpenBatch(input.batchId);
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt++) {
      try {
        const created = await this.prisma.client.$transaction(async (tx) => {
          const code = await this.nextIssueCode(tx);
          return tx.materialIssue.create({
            data: {
              tenantId: currentTenantId(),
              code,
              issueDate: toDate(input.issueDate),
              tons: input.tons,
              note: input.note,
              batchId: input.batchId,
            },
          });
        });
        return this.issueDetail(created.id);
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

  async updateIssue(id: string, input: MaterialIssueUpdateInput): Promise<MaterialIssueDto> {
    const existing = await this.prisma.client.materialIssue.findUnique({
      where: { id },
      select: { id: true, tenantId: true, deletedAt: true, batch: { select: { status: true } } },
    });
    if (!existing || existing.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '原木领用单不存在');
    }
    this.assertBatchEditable(existing.batch.status, '原木领用单');
    await this.assertOpenBatch(input.batchId);
    await this.prisma.client.materialIssue.updateMany({
      where: { id },
      data: {
        issueDate: toDate(input.issueDate),
        tons: input.tons,
        note: input.note,
        batchId: input.batchId,
      },
    });
    return this.issueDetail(id);
  }

  async removeIssue(id: string): Promise<void> {
    const existing = await this.prisma.client.materialIssue.findUnique({
      where: { id },
      select: { id: true, tenantId: true, deletedAt: true, batch: { select: { status: true } } },
    });
    if (!existing || existing.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '原木领用单不存在');
    }
    this.assertBatchEditable(existing.batch.status, '原木领用单');
    await this.prisma.client.materialIssue.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async removeIssues(ids: string[]): Promise<{ deleted: number }> {
    const rows = await this.prisma.client.materialIssue.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { batch: { select: { status: true } } },
    });
    if (rows.some((row) => row.batch.status === 'CLOSED')) {
      throw problem(409, 'BATCH_CLOSED', '已关闭批次的领用单不能删除');
    }
    const updated = await this.prisma.client.materialIssue.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { deleted: updated.count };
  }

  // ── 方木产出 ─────────────────────────────────────────────

  private toOutputLineDto(row: {
    id: string;
    seq: number;
    lengthMm: number;
    widthMm: number;
    heightMm: number;
    pieces: number;
    volumeM3: Prisma.Decimal;
    note: string;
  }): ProductionOutputLineDto {
    return {
      id: row.id,
      seq: row.seq,
      lengthMm: row.lengthMm,
      widthMm: row.widthMm,
      heightMm: row.heightMm,
      pieces: row.pieces,
      volumeM3: volume(row.volumeM3),
      note: row.note,
    };
  }

  private toOutputListItem(
    row: OutputListRow,
    settledAmount = '0.00',
  ): ProductionOutputListItemDto {
    return {
      id: row.id,
      code: row.code,
      outputDate: isoDate(row.outputDate),
      lineCount: row.lines.length,
      totalVolume: sumVolumes(row.lines.map((line) => line.volumeM3.toString())),
      settledAmount,
      batchId: row.batchId,
      batchCode: row.batch.code,
      batchStatus: row.batch.status === 'OPEN' ? 'open' : 'closed',
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toOutputDto(row: OutputWithLines, settlement?: OutputSettlement): ProductionOutputDto {
    const active = row.lines.filter((line) => line.deletedAt === null);
    return {
      id: row.id,
      code: row.code,
      outputDate: isoDate(row.outputDate),
      lineCount: active.length,
      totalVolume: sumVolumes(active.map((line) => line.volumeM3.toString())),
      settledAmount: settlement?.amount ?? '0.00',
      sourceIssueCodes: settlement?.sources ?? [],
      batchId: row.batchId,
      batchCode: row.batch.code,
      batchStatus: row.batch.status === 'OPEN' ? 'open' : 'closed',
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      outputs: active
        .sort((left, right) => left.seq - right.seq)
        .map((line) => this.toOutputLineDto(line)),
    };
  }

  private async nextOutputCode(tx: Prisma.TransactionClient): Promise<string> {
    const last = await tx.productionOutput.findFirst({
      where: { code: { startsWith: OUTPUT_PREFIX } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const seq = last ? Number(last.code.slice(OUTPUT_PREFIX.length)) + 1 : 1;
    return `${OUTPUT_PREFIX}${String(seq).padStart(CODE_PAD, '0')}`;
  }

  async listOutputs(query: ProductionOutputListQuery): Promise<ProductionOutputListDto> {
    const where: Prisma.ProductionOutputWhereInput = { deletedAt: null };
    const dateFilter = dateFilterFrom(query);
    if (dateFilter) {
      where.outputDate = dateFilter;
    }
    if (query.batchId) {
      where.batchId = query.batchId;
    }
    const [total, rows, sum] = await Promise.all([
      this.prisma.client.productionOutput.count({ where }),
      this.prisma.client.productionOutput.findMany({
        where,
        orderBy: [{ outputDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          lines: { where: { deletedAt: null }, select: { volumeM3: true } },
          batch: true,
        },
      }),
      this.prisma.client.productionOutputLine.aggregate({
        where: {
          deletedAt: null,
          output: {
            deletedAt: null,
            ...(dateFilter ? { outputDate: dateFilter } : {}),
            ...(query.batchId ? { batchId: query.batchId } : {}),
          },
        },
        _sum: { volumeM3: true },
      }),
    ]);
    const maps = await this.settlementMaps();
    return {
      total,
      summary: { totalVolume: volume(this.toString(sum._sum.volumeM3)) },
      items: rows.map((row) =>
        this.toOutputListItem(row, maps.outputs.get(row.code)?.amount ?? '0.00'),
      ),
    };
  }

  async outputDetail(id: string): Promise<ProductionOutputDto> {
    const row = await this.prisma.client.productionOutput.findUnique({
      where: { id },
      include: {
        lines: { where: { deletedAt: null }, orderBy: { seq: 'asc' } },
        batch: true,
      },
    });
    if (!row || row.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '方木产出单不存在');
    }
    const maps = await this.settlementMaps();
    return this.toOutputDto(row, maps.outputs.get(row.code));
  }

  private computeLines(
    outputs: ProductionOutputInput['outputs'] | ProductionOutputUpdateInput['outputs'],
  ): Array<{
    lengthMm: number;
    widthMm: number;
    heightMm: number;
    pieces: number;
    volumeM3: string;
    note: string;
  }> {
    return outputs.map((output) => ({
      lengthMm: output.lengthMm,
      widthMm: output.widthMm,
      heightMm: output.heightMm,
      pieces: output.pieces,
      volumeM3: calcVolumeM3(output.lengthMm, output.widthMm, output.heightMm, output.pieces),
      note: output.note,
    }));
  }

  async createOutput(input: ProductionOutputInput): Promise<ProductionOutputDto> {
    await this.assertOpenBatch(input.batchId);
    const lines = this.computeLines(input.outputs);
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt++) {
      try {
        const created = await this.prisma.client.$transaction(async (tx) => {
          const code = await this.nextOutputCode(tx);
          const output = await tx.productionOutput.create({
            data: {
              tenantId: currentTenantId(),
              code,
              outputDate: toDate(input.outputDate),
              note: input.note,
              batchId: input.batchId,
            },
          });
          await tx.productionOutputLine.createMany({
            data: lines.map((line, index) => ({
              tenantId: currentTenantId(),
              outputId: output.id,
              seq: index + 1,
              ...line,
            })),
          });
          return output;
        });
        return this.outputDetail(created.id);
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

  async updateOutput(id: string, input: ProductionOutputUpdateInput): Promise<ProductionOutputDto> {
    const existing = await this.prisma.client.productionOutput.findUnique({
      where: { id },
      select: { id: true, tenantId: true, deletedAt: true, batch: { select: { status: true } } },
    });
    if (!existing || existing.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '方木产出单不存在');
    }
    this.assertBatchEditable(existing.batch.status, '方木产出单');
    await this.assertOpenBatch(input.batchId);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.productionOutput.updateMany({
        where: { id },
        data: {
          outputDate: toDate(input.outputDate),
          note: input.note,
          batchId: input.batchId,
        },
      });
      const existingRows = await tx.productionOutputLine.findMany({
        where: { outputId: id },
        select: { id: true, seq: true },
      });
      let nextSeq = existingRows.reduce((max, row) => Math.max(max, row.seq), 0);
      const existingIds = new Set(existingRows.map((row) => row.id));
      const keepIds = new Set<string>();
      for (const output of input.outputs) {
        const computed = this.computeLines([output])[0]!;
        if (output.id && existingIds.has(output.id)) {
          keepIds.add(output.id);
          await tx.productionOutputLine.updateMany({
            where: { id: output.id, outputId: id },
            data: computed,
          });
        } else {
          nextSeq += 1;
          await tx.productionOutputLine.create({
            data: { tenantId: currentTenantId(), outputId: id, seq: nextSeq, ...computed },
          });
        }
      }
      const removeIds = [...existingIds].filter((lineId) => !keepIds.has(lineId));
      if (removeIds.length > 0) {
        await tx.productionOutputLine.updateMany({
          where: { id: { in: removeIds } },
          data: { deletedAt: new Date() },
        });
      }
    });
    return this.outputDetail(id);
  }

  async removeOutput(id: string): Promise<void> {
    const existing = await this.prisma.client.productionOutput.findUnique({
      where: { id },
      select: { id: true, tenantId: true, deletedAt: true, batch: { select: { status: true } } },
    });
    if (!existing || existing.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '方木产出单不存在');
    }
    this.assertBatchEditable(existing.batch.status, '方木产出单');
    await this.prisma.client.$transaction(async (tx) => {
      await tx.productionOutput.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await tx.productionOutputLine.updateMany({
        where: { outputId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });
  }

  async removeOutputs(ids: string[]): Promise<{ deleted: number }> {
    return this.prisma.client.$transaction(async (tx) => {
      const rows = await tx.productionOutput.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true, batch: { select: { status: true } } },
      });
      if (rows.some((row) => row.batch.status === 'CLOSED')) {
        throw problem(409, 'BATCH_CLOSED', '已关闭批次的方木产出单不能删除');
      }
      if (rows.length === 0) {
        return { deleted: 0 };
      }
      const outputIds = rows.map((row) => row.id);
      await tx.productionOutput.updateMany({
        where: { id: { in: outputIds } },
        data: { deletedAt: new Date() },
      });
      await tx.productionOutputLine.updateMany({
        where: { outputId: { in: outputIds }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      return { deleted: outputIds.length };
    });
  }

  // ── 生产批次（轻量成本对象）─────────────────────────────

  private async nextBatchCode(tx: Prisma.TransactionClient): Promise<string> {
    const last = await tx.productionBatch.findFirst({
      where: { code: { startsWith: BATCH_PREFIX } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const seq = last ? Number(last.code.slice(BATCH_PREFIX.length)) + 1 : 1;
    return `${BATCH_PREFIX}${String(seq).padStart(CODE_PAD, '0')}`;
  }

  private async assertOpenBatch(batchId: string): Promise<BatchRow> {
    const batch = await this.prisma.client.productionBatch.findUnique({ where: { id: batchId } });
    if (!batch || batch.deletedAt !== null) {
      throw problem(404, 'BATCH_NOT_FOUND', '生产批次不存在');
    }
    if (batch.status === 'CLOSED') {
      throw problem(409, 'BATCH_CLOSED', '批次已关闭，不能新增或调整单据');
    }
    return batch;
  }

  private assertBatchEditable(status: string, label: string): void {
    if (status === 'CLOSED') {
      throw problem(409, 'BATCH_CLOSED', `${label}所属批次已关闭，不能修改或删除`);
    }
  }

  // 期初方木归属「期初库存批次」；首次需要时自动创建，之后只读复用
  private async ensureOpeningBatch(): Promise<BatchRow | null> {
    const opening = await this.findOpening();
    if (!opening) {
      return null;
    }
    const timberItems = opening.items.filter(
      (item) => item.targetType === 'TIMBER' && item.deletedAt === null,
    );
    if (timberItems.length === 0) {
      return null;
    }
    const existing = await this.prisma.client.productionBatch.findFirst({
      where: { kind: 'OPENING', deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      if (isoDate(existing.batchDate) !== isoDate(opening.adjustmentDate)) {
        return this.prisma.client.productionBatch.update({
          where: { id: existing.id },
          data: { batchDate: opening.adjustmentDate },
        });
      }
      return existing;
    }
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt++) {
      try {
        return await this.prisma.client.$transaction(async (tx) => {
          const code = await this.nextBatchCode(tx);
          return tx.productionBatch.create({
            data: {
              tenantId: currentTenantId(),
              code,
              batchDate: opening.adjustmentDate,
              status: 'CLOSED',
              kind: 'OPENING',
              note: '期初库存批次',
              closedAt: new Date(),
            },
          });
        });
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

  private toBatchDto(
    row: BatchRow,
    pool?: {
      timberVolume: string;
      timberAmount: string;
      timberUnitCost: string;
      pendingAmount: string;
      closedSettledAmount: string;
    },
    issueCount = 0,
    outputCount = 0,
  ): ProductionBatchDto {
    return {
      id: row.id,
      code: row.code,
      batchDate: isoDate(row.batchDate),
      status: row.status === 'OPEN' ? 'open' : 'closed',
      kind: row.kind === 'OPENING' ? 'opening' : 'production',
      note: row.note,
      closedAt: row.closedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      timberVolume: pool?.timberVolume ?? '0.0000',
      timberAmount: pool?.timberAmount ?? '0.00',
      timberUnitCost: pool?.timberUnitCost ?? '0.000000',
      pendingAmount: pool?.pendingAmount ?? '0.00',
      closedSettledAmount: pool?.closedSettledAmount ?? '0.00',
      issueCount,
      outputCount,
    };
  }

  private async batchPoolMap(): Promise<Map<string, ReturnType<typeof foldInventoryEvents>['batches'][number]>> {
    const { events } = await this.buildInventoryEvents();
    return new Map(foldInventoryEvents(events).batches.map((batch) => [batch.ref, batch]));
  }

  async listBatches(query: ProductionBatchListQuery): Promise<ProductionBatchListDto> {
    const where: Prisma.ProductionBatchWhereInput = { deletedAt: null };
    const dateFilter = dateFilterFrom(query);
    if (dateFilter) {
      where.batchDate = dateFilter;
    }
    if (query.status) {
      where.status = query.status === 'open' ? 'OPEN' : 'CLOSED';
    }
    const [total, rows, poolMap] = await Promise.all([
      this.prisma.client.productionBatch.count({ where }),
      this.prisma.client.productionBatch.findMany({
        where,
        orderBy: [{ batchDate: 'desc' }, { code: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          _count: {
            select: {
              issues: { where: { deletedAt: null } },
              outputs: { where: { deletedAt: null } },
            },
          },
        },
      }),
      this.batchPoolMap(),
    ]);
    return {
      total,
      items: rows.map((row) =>
        this.toBatchDto(row, poolMap.get(row.code), row._count.issues, row._count.outputs),
      ),
    };
  }

  async batchDetail(id: string): Promise<ProductionBatchDetailDto> {
    const row = await this.prisma.client.productionBatch.findUnique({
      where: { id },
      include: {
        issues: { where: { deletedAt: null }, orderBy: { issueDate: 'asc' } },
        outputs: {
          where: { deletedAt: null },
          orderBy: { outputDate: 'asc' },
          include: { lines: { where: { deletedAt: null } } },
        },
      },
    });
    if (!row || row.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '生产批次不存在');
    }
    const maps = await this.settlementMaps();
    const pool = (await this.batchPoolMap()).get(row.code);
    const timberLines: ProductionBatchTimberLineDto[] = Object.entries(pool?.specs ?? {})
      .map(([key, quantity]) => {
        const [lengthMm = 0, widthMm = 0, heightMm = 0] = key.split('x').map(Number);
        const unitCost = pool?.timberUnitCost ?? '0.000000';
        return {
          lengthMm,
          widthMm,
          heightMm,
          quantity,
          unitCost,
          amount: calcMaterialCostAmount(quantity, unitCost),
        };
      })
      .sort(
        (left, right) =>
          left.lengthMm - right.lengthMm ||
          left.widthMm - right.widthMm ||
          left.heightMm - right.heightMm,
      );
    const issues: ProductionBatchIssueDto[] = row.issues.map((issue) => {
      const settlement = maps.issues.get(issue.code);
      return {
        id: issue.id,
        code: issue.code,
        issueDate: isoDate(issue.issueDate),
        tons: tons(issue.tons),
        settledAmount: settlement?.settled ?? '0.00',
        pendingAmount: settlement?.remaining ?? '0.00',
      };
    });
    const outputs: ProductionBatchOutputDto[] = row.outputs.map((output) => ({
      id: output.id,
      code: output.code,
      outputDate: isoDate(output.outputDate),
      totalVolume: sumVolumes(output.lines.map((line) => line.volumeM3.toString())),
      settledAmount: maps.outputs.get(output.code)?.amount ?? '0.00',
    }));
    return {
      ...this.toBatchDto(row, pool, issues.length, outputs.length),
      issues,
      outputs,
      timberLines,
    };
  }

  async createBatch(input: ProductionBatchInput): Promise<ProductionBatchDetailDto> {
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt++) {
      try {
        const created = await this.prisma.client.$transaction(async (tx) => {
          const code = await this.nextBatchCode(tx);
          return tx.productionBatch.create({
            data: {
              tenantId: currentTenantId(),
              code,
              batchDate: toDate(input.batchDate),
              note: input.note,
              kind: 'PRODUCTION',
              status: 'OPEN',
            },
          });
        });
        return this.batchDetail(created.id);
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

  async updateBatch(id: string, input: ProductionBatchUpdateInput): Promise<ProductionBatchDetailDto> {
    const existing = await this.prisma.client.productionBatch.findUnique({ where: { id } });
    if (!existing || existing.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '生产批次不存在');
    }
    if (existing.status === 'CLOSED') {
      throw problem(409, 'BATCH_CLOSED', '批次已关闭，不能修改');
    }
    await this.prisma.client.productionBatch.updateMany({
      where: { id },
      data: { batchDate: toDate(input.batchDate), note: input.note },
    });
    return this.batchDetail(id);
  }

  async closeBatch(id: string): Promise<ProductionBatchDetailDto> {
    const existing = await this.prisma.client.productionBatch.findUnique({ where: { id } });
    if (!existing || existing.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '生产批次不存在');
    }
    if (existing.status === 'CLOSED') {
      throw problem(409, 'BATCH_ALREADY_CLOSED', '批次已关闭');
    }
    const pool = (await this.batchPoolMap()).get(existing.code);
    if (pool && pool.pendingAmount !== '0.00' && isNegativeOrZero(pool.timberVolume)) {
      throw problem(
        409,
        'BATCH_PENDING_NO_STOCK',
        '批次还有待结转成本但没有方木库存，请先录产出或删除领用后再关闭',
      );
    }
    await this.prisma.client.productionBatch.updateMany({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    return this.batchDetail(id);
  }

  async closeBatches(ids: string[]): Promise<{ closed: number; skipped: number }> {
    const uniqueIds = [...new Set(ids)];
    const rows = await this.prisma.client.productionBatch.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: { id: true, code: true, status: true },
    });
    const openRows = rows.filter((row) => row.status === 'OPEN');
    if (openRows.length === 0) {
      return { closed: 0, skipped: uniqueIds.length };
    }
    const poolMap = await this.batchPoolMap();
    const blocked = openRows.filter((row) => {
      const pool = poolMap.get(row.code);
      return pool && pool.pendingAmount !== '0.00' && isNegativeOrZero(pool.timberVolume);
    });
    if (blocked.length > 0) {
      throw problem(
        409,
        'BATCH_PENDING_NO_STOCK',
        `批次 ${blocked.map((row) => row.code).join('、')} 还有待结转成本但没有方木库存，请先录产出或删除领用后再关闭`,
      );
    }
    const updated = await this.prisma.client.productionBatch.updateMany({
      where: { id: { in: openRows.map((row) => row.id) }, status: 'OPEN', deletedAt: null },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    return { closed: updated.count, skipped: uniqueIds.length - updated.count };
  }

  // ── 库存汇总 ─────────────────────────────────────────────

  private async findOpening(): Promise<OpeningRow | null> {
    return this.prisma.client.inventoryAdjustment.findFirst({
      where: { type: 'OPENING', deletedAt: null },
      include: { items: { where: { deletedAt: null } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // 库存事件流（期初 + 采购 + 领用 + 产出 + 销售 + 盘点 + 批次关闭）：汇总与归属共用同一套构造
  private async buildInventoryEvents(excludeSaleCode?: string): Promise<{
    opening: Awaited<ReturnType<ProductionService['findOpening']>>;
    openingBatch: BatchRow | null;
    events: InventoryEvent[];
  }> {
    const opening = await this.findOpening();
    if (!opening) {
      return { opening: null, openingBatch: null, events: [] };
    }
    const openingBatch = await this.ensureOpeningBatch();
    const openingDate = opening.adjustmentDate;
    const [purchases, issues, outputs, sales, counts, closedBatches] = await Promise.all([
      this.prisma.client.purchaseOrder.findMany({
        where: { deletedAt: null, purchaseDate: { gte: openingDate } },
        select: {
          code: true,
          purchaseDate: true,
          deliveredTons: true,
          totalAmount: true,
          createdAt: true,
        },
      }),
      this.prisma.client.materialIssue.findMany({
        where: { deletedAt: null, issueDate: { gte: openingDate } },
        select: {
          code: true,
          issueDate: true,
          tons: true,
          createdAt: true,
          batch: { select: { code: true, batchDate: true } },
        },
      }),
      this.prisma.client.productionOutput.findMany({
        where: { deletedAt: null, outputDate: { gte: openingDate } },
        select: {
          code: true,
          outputDate: true,
          createdAt: true,
          batch: { select: { code: true, batchDate: true } },
          lines: {
            where: { deletedAt: null },
            select: { lengthMm: true, widthMm: true, heightMm: true, volumeM3: true },
          },
        },
      }),
      this.prisma.client.saleOrder.findMany({
        where: {
          deletedAt: null,
          saleDate: { gte: openingDate },
          ...(excludeSaleCode ? { code: { not: excludeSaleCode } } : {}),
        },
        select: {
          code: true,
          saleDate: true,
          createdAt: true,
          items: {
            where: { deletedAt: null },
            select: { lengthMm: true, widthMm: true, heightMm: true, volumeM3: true },
          },
        },
      }),
      this.prisma.client.inventoryAdjustment.findMany({
        where: { deletedAt: null, adjustmentDate: { gte: openingDate }, type: 'COUNT' },
        select: {
          code: true,
          adjustmentDate: true,
          createdAt: true,
          items: {
            where: { deletedAt: null },
            select: {
              targetType: true,
              lengthMm: true,
              widthMm: true,
              heightMm: true,
              differenceQuantity: true,
              amount: true,
            },
          },
        },
      }),
      this.prisma.client.productionBatch.findMany({
        where: {
          deletedAt: null,
          kind: 'PRODUCTION',
          status: 'CLOSED',
          closedAt: { not: null },
        },
        select: { code: true, closedAt: true },
      }),
    ]);

    const events: InventoryEvent[] = [];
    const rawOpening = opening.items.find((item) => item.targetType === 'RAW_LOG');
    const timberOpening = opening.items.filter((item) => item.targetType === 'TIMBER');
    if (timberOpening.length > 0 && !openingBatch) {
      throw new Error('期初方木存在但期初库存批次缺失');
    }
    events.push({
      kind: 'opening',
      date: isoDate(opening.adjustmentDate),
      createdAt: opening.createdAt.toISOString(),
      ref: opening.code,
      raw: rawOpening
        ? {
            tons: tons(rawOpening.actualQuantity),
            amount: money(rawOpening.amount),
          }
        : undefined,
      timber: timberOpening.map((item) => ({
        spec: {
          lengthMm: item.lengthMm ?? 0,
          widthMm: item.widthMm ?? 0,
          heightMm: item.heightMm ?? 0,
        },
        volume: volume(item.actualQuantity),
        amount: money(item.amount),
        batchRef: openingBatch!.code,
      })),
    });

    for (const purchase of purchases) {
      events.push({
        kind: 'purchase',
        date: isoDate(purchase.purchaseDate),
        createdAt: purchase.createdAt.toISOString(),
        ref: purchase.code,
        deliveredTons: tons(purchase.deliveredTons),
        totalAmount: money(purchase.totalAmount),
      });
    }
    const batchMaxDate = new Map<string, string>();
    for (const issue of issues) {
      const date = isoDate(issue.issueDate);
      const current = batchMaxDate.get(issue.batch.code);
      if (!current || date > current) {
        batchMaxDate.set(issue.batch.code, date);
      }
      events.push({
        kind: 'issue',
        date,
        createdAt: issue.createdAt.toISOString(),
        ref: issue.code,
        tons: tons(issue.tons),
        batchRef: issue.batch.code,
        batchDate: isoDate(issue.batch.batchDate),
      });
    }
    for (const output of outputs) {
      const date = isoDate(output.outputDate);
      const current = batchMaxDate.get(output.batch.code);
      if (!current || date > current) {
        batchMaxDate.set(output.batch.code, date);
      }
      events.push({
        kind: 'output',
        date,
        createdAt: output.createdAt.toISOString(),
        ref: output.code,
        batchRef: output.batch.code,
        batchDate: isoDate(output.batch.batchDate),
        outputs: output.lines.map((line) => ({
          spec: {
            lengthMm: line.lengthMm,
            widthMm: line.widthMm,
            heightMm: line.heightMm,
          },
          volume: volume(line.volumeM3),
        })),
      });
    }
    for (const order of sales) {
      events.push({
        kind: 'sale',
        date: isoDate(order.saleDate),
        createdAt: order.createdAt.toISOString(),
        ref: order.code,
        items: order.items.map((item) => ({
          spec: {
            lengthMm: item.lengthMm,
            widthMm: item.widthMm,
            heightMm: item.heightMm,
          },
          volume: volume(item.volumeM3),
        })),
      });
    }
    for (const adjustment of counts) {
      adjustment.items.forEach((item, index) => {
        events.push({
          kind: 'adjustment',
          date: isoDate(adjustment.adjustmentDate),
          createdAt: adjustment.createdAt.toISOString(),
          ref: `${adjustment.code}-${index + 1}`,
          targetType: item.targetType === 'RAW_LOG' ? 'raw_log' : 'timber',
          spec:
            item.targetType === 'TIMBER'
              ? {
                  lengthMm: item.lengthMm ?? 0,
                  widthMm: item.widthMm ?? 0,
                  heightMm: item.heightMm ?? 0,
                }
              : undefined,
          quantityDelta:
            item.targetType === 'RAW_LOG'
              ? tons(item.differenceQuantity)
              : volume(item.differenceQuantity),
          amountDelta: money(item.amount),
        });
      });
    }
    for (const batch of closedBatches) {
      if (!batch.closedAt) {
        continue;
      }
      // 关闭事件排在批次全部单据之后：即使单据日期晚于关闭时间也不会漏结转
      const closeDate = [isoDate(batch.closedAt), batchMaxDate.get(batch.code) ?? '']
        .sort()
        .at(-1)!;
      events.push({
        kind: 'batch_close',
        date: closeDate,
        createdAt: batch.closedAt.toISOString(),
        ref: batch.code,
        batchRef: batch.code,
      });
    }

    return { opening, openingBatch, events };
  }

  async getInventorySummary(): Promise<InventorySummaryDto> {
    const { opening, events } = await this.buildInventoryEvents();
    if (!opening) {
      return EMPTY_SUMMARY;
    }
    const pool = foldInventoryEvents(events);
    const timberLines: InventoryTimberLineDto[] = Object.entries(pool.specs)
      .map(([key, quantity]) => {
        const [lengthMm = 0, widthMm = 0, heightMm = 0] = key.split('x').map(Number);
        return {
          productType: 'square_timber',
          lengthMm,
          widthMm,
          heightMm,
          quantity,
          unitCost: pool.timberUnitCost,
          amount: calcMaterialCostAmount(quantity, pool.timberUnitCost),
          negative: isNegative(quantity),
        };
      })
      .sort((left, right) =>
        left.lengthMm - right.lengthMm ||
        left.widthMm - right.widthMm ||
        left.heightMm - right.heightMm,
      );

    const pendingIssues = pool.issueSettlements.filter((item) => item.remaining !== '0.00');
    const earliestPending = [...pendingIssues].sort(
      (left, right) => left.date.localeCompare(right.date) || left.ref.localeCompare(right.ref),
    )[0];

    const batchRows = await this.prisma.client.productionBatch.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, batchDate: true, status: true, kind: true },
    });
    const batchMeta = new Map(batchRows.map((row) => [row.code, row]));
    const batches: InventoryBatchDto[] = pool.batches
      .map((batch) => {
        const meta = batchMeta.get(batch.ref);
        if (!meta) {
          return null;
        }
        return {
          id: meta.id,
          code: batch.ref,
          batchDate: isoDate(meta.batchDate),
          status: meta.status === 'OPEN' ? ('open' as const) : ('closed' as const),
          kind: meta.kind === 'OPENING' ? ('opening' as const) : ('production' as const),
          timberVolume: batch.timberVolume,
          timberAmount: batch.timberAmount,
          timberUnitCost: batch.timberUnitCost,
          pendingAmount: batch.pendingAmount,
        };
      })
      .filter((batch): batch is InventoryBatchDto => batch !== null);

    return {
      needsOpening: false,
      openingDate: isoDate(opening.adjustmentDate),
      raw: {
        quantity: pool.rawTons,
        unitCost: pool.rawUnitCost,
        amount: pool.rawAmount,
        negative: isNegative(pool.rawTons),
      },
      timber: {
        quantity: pool.timberVolume,
        unitCost: pool.timberUnitCost,
        amount: pool.timberAmount,
        negative: isNegative(pool.timberVolume),
      },
      timberLines,
      batches,
      shortfallVolume: pool.shortfallVolume,
      shortfallAmount: pool.shortfallAmount,
      totalAmount: calcInventoryTotalAmount(pool.rawAmount, pool.timberAmount),
      pendingAmount: pool.pendingAmount,
      pendingIssueCount: pendingIssues.length,
      earliestPendingIssueCode: earliestPending?.ref ?? null,
      earliestPendingIssueDate: earliestPending?.date ?? null,
      negativeLineCount:
        (isNegative(pool.rawTons) ? 1 : 0) +
        timberLines.filter((line) => line.negative).length,
    };
  }

  // 销售下单材料成本：按保存时当前批次层先进先出试算（product/生产与库存.md R-生产-004）
  async calcSaleMaterialCost(
    items: Array<{ lengthMm: number; widthMm: number; heightMm: number; volumeM3: string }>,
    excludeSaleCode?: string,
  ): Promise<{ amount: string; unitCost: string; status: 'final' | 'pending'; layers: SaleCostLayer[] }> {
    const { opening, events } = await this.buildInventoryEvents(excludeSaleCode);
    if (!opening) {
      return { amount: '0.00', unitCost: '0.000000', status: 'pending', layers: [] };
    }
    return calcTimberSaleCost(
      events,
      items.map((item) => ({
        spec: {
          lengthMm: item.lengthMm,
          widthMm: item.widthMm,
          heightMm: item.heightMm,
        },
        volume: volume(item.volumeM3),
      })),
    );
  }

  // ── 库存调整单只读（期初 / 盘点记录）────────────────────

  private sumDecimals(values: Array<{ toString(): string }>, scale: 2 | 3 | 4): string {
    return fromScaled(
      values.reduce<bigint>((sum, value) => sum + toScaled(value.toString(), scale), 0n),
      scale,
    );
  }

  private toAdjustmentItemDto(row: {
    targetType: string;
    lengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
    bookQuantity: Prisma.Decimal;
    actualQuantity: Prisma.Decimal;
    differenceQuantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    amount: Prisma.Decimal;
    reason: string;
    note: string;
  }): InventoryAdjustmentItemDto {
    const reasons: Record<string, string> = {
      OPENING: 'opening',
      MEASUREMENT: 'measurement',
      MISSING: 'missing',
      DAMAGE: 'damage',
      OTHER: 'other',
    };
    const normalize = row.targetType === 'RAW_LOG' ? tons : volume;
    return {
      targetType: row.targetType === 'RAW_LOG' ? 'raw_log' : 'timber',
      lengthMm: row.lengthMm,
      widthMm: row.widthMm,
      heightMm: row.heightMm,
      bookQuantity: normalize(row.bookQuantity),
      actualQuantity: normalize(row.actualQuantity),
      differenceQuantity: normalize(row.differenceQuantity),
      unitCost: cost6(row.unitCost),
      amount: money(row.amount),
      reason: reasons[row.reason] ?? 'other',
      note: row.note,
    };
  }

  async getOpeningCurrent(): Promise<InventoryOpeningDetailDto> {
    const opening = await this.findOpening();
    if (!opening) {
      throw problem(404, 'NOT_FOUND', '尚未设置期初库存');
    }
    return {
      id: opening.id,
      code: opening.code,
      openingDate: isoDate(opening.adjustmentDate),
      operatorName: opening.createdByName || '—',
      note: opening.note,
      createdAt: opening.createdAt.toISOString(),
      totalAmount: this.sumDecimals(opening.items.map((item) => item.amount), 2),
      items: opening.items.map((item) => this.toAdjustmentItemDto(item)),
    };
  }

  async listCounts(query: InventoryCountListQuery): Promise<InventoryCountListDto> {
    const where: Prisma.InventoryAdjustmentWhereInput = { type: 'COUNT', deletedAt: null };
    const dateFilter = dateFilterFrom(query);
    if (dateFilter) {
      where.adjustmentDate = dateFilter;
    }
    if (query.targetType) {
      where.items = {
        some: {
          deletedAt: null,
          targetType: query.targetType === 'raw_log' ? 'RAW_LOG' : 'TIMBER',
        },
      };
    }
    const [total, rows] = await Promise.all([
      this.prisma.client.inventoryAdjustment.count({ where }),
      this.prisma.client.inventoryAdjustment.findMany({
        where,
        orderBy: [{ adjustmentDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { items: { where: { deletedAt: null } } },
      }),
    ]);
    return {
      total,
      items: rows.map((row) => {
        const rawItems = row.items.filter((item) => item.targetType === 'RAW_LOG');
        const timberItems = row.items.filter((item) => item.targetType === 'TIMBER');
        return {
          id: row.id,
          code: row.code,
          targetType: timberItems.length > 0 ? 'timber' : 'raw_log',
          adjustmentDate: isoDate(row.adjustmentDate),
          operatorName: row.createdByName || '—',
          gainCount: row.items.filter((item) => item.differenceQuantity.gt(0)).length,
          lossCount: row.items.filter((item) => item.differenceQuantity.lt(0)).length,
          rawDifferenceTons: this.sumDecimals(rawItems.map((item) => item.differenceQuantity), 3),
          timberDifferenceVolume: this.sumDecimals(
            timberItems.map((item) => item.differenceQuantity),
            4,
          ),
          differenceAmount: this.sumDecimals(row.items.map((item) => item.amount), 2),
          note: row.note,
          createdAt: row.createdAt.toISOString(),
        };
      }),
    };
  }

  async getCountDetail(id: string): Promise<InventoryCountDetailDto> {
    const row = await this.prisma.client.inventoryAdjustment.findFirst({
      where: { id, type: 'COUNT', deletedAt: null },
      include: { items: { where: { deletedAt: null } } },
    });
    if (!row) {
      throw problem(404, 'NOT_FOUND', '盘点记录不存在');
    }
    return {
      id: row.id,
      code: row.code,
      targetType: row.items.some((item) => item.targetType === 'TIMBER') ? 'timber' : 'raw_log',
      adjustmentDate: isoDate(row.adjustmentDate),
      operatorName: row.createdByName || '—',
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      items: row.items.map((item) => this.toAdjustmentItemDto(item)),
    };
  }

  // ── 期初 / 盘点 ──────────────────────────────────────────

  private async nextAdjustmentCode(tx: Prisma.TransactionClient): Promise<string> {
    const last = await tx.inventoryAdjustment.findFirst({
      where: { code: { startsWith: ADJUSTMENT_PREFIX } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const seq = last ? Number(last.code.slice(ADJUSTMENT_PREFIX.length)) + 1 : 1;
    return `${ADJUSTMENT_PREFIX}${String(seq).padStart(CODE_PAD, '0')}`;
  }

  private normalizeOpeningAmount(
    quantity: string,
    unitCost: string | undefined,
    amount: string | undefined,
    quantityScale: 3 | 4,
  ): { unitCost: string; amount: string } {
    if (unitCost) {
      const normalizedUnitCost = cost6(unitCost);
      return {
        unitCost: normalizedUnitCost,
        amount: amount ? money(amount) : calcMaterialCostAmount(quantity, normalizedUnitCost),
      };
    }
    const normalizedAmount = money(amount ?? '0');
    const quantityScaled = toScaled(quantity, quantityScale);
    if (quantityScaled === 0n) {
      return { unitCost: '0.000000', amount: normalizedAmount };
    }
    // 只填金额时按金额 / 数量反推单位成本（6 位），供只读详情展示
    const factor = quantityScale === 3 ? 10n ** 7n : 10n ** 8n;
    return {
      unitCost: fromScaled(
        divRoundHalfUp(toScaled(normalizedAmount, 2) * factor, quantityScaled),
        6,
      ),
      amount: normalizedAmount,
    };
  }

  async createOpening(
    input: InventoryOpeningInput,
    operator?: AdjustmentOperator,
  ): Promise<InventoryAdjustmentResultDto> {
    const existing = await this.prisma.client.inventoryAdjustment.findFirst({
      where: { type: 'OPENING', deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw problem(409, 'OPENING_EXISTS', '期初库存已设置，不能重复设置');
    }
    const openingDate = toDate(input.openingDate);
    const movementWhere = { deletedAt: null };
    const [purchaseCount, issueCount, outputCount, saleCount, countAdjustmentCount] =
      await Promise.all([
        this.prisma.client.purchaseOrder.count({
          where: { ...movementWhere, purchaseDate: { gte: openingDate } },
        }),
        this.prisma.client.materialIssue.count({
          where: { ...movementWhere, issueDate: { gte: openingDate } },
        }),
        this.prisma.client.productionOutput.count({
          where: { ...movementWhere, outputDate: { gte: openingDate } },
        }),
        this.prisma.client.saleOrder.count({
          where: { ...movementWhere, saleDate: { gte: openingDate } },
        }),
        this.prisma.client.inventoryAdjustment.count({
          where: {
            ...movementWhere,
            type: 'COUNT',
            adjustmentDate: { gte: openingDate },
          },
        }),
      ]);
    if (purchaseCount + issueCount + outputCount + saleCount + countAdjustmentCount > 0) {
      throw problem(
        409,
        'OPENING_AFTER_MOVEMENT',
        '期初日期之后已有库存变动，不能设置期初；请改用库存盘点调整',
      );
    }

    const rawQuantity = tons(input.rawLog.quantity);
    const raw = this.normalizeOpeningAmount(
      rawQuantity,
      input.rawLog.unitCost,
      input.rawLog.amount,
      3,
    );
    const items: Array<{
      targetType: 'RAW_LOG' | 'TIMBER';
      lengthMm: number | null;
      widthMm: number | null;
      heightMm: number | null;
      bookQuantity: string;
      actualQuantity: string;
      differenceQuantity: string;
      unitCost: string;
      amount: string;
      reason: 'OPENING';
      note: string;
    }> = [];
    if (rawQuantity !== '0.000' || raw.amount !== '0.00') {
      items.push({
        targetType: 'RAW_LOG',
        lengthMm: null,
        widthMm: null,
        heightMm: null,
        bookQuantity: '0.0000',
        actualQuantity: rawQuantity,
        differenceQuantity: rawQuantity,
        unitCost: raw.unitCost,
        amount: raw.amount,
        reason: 'OPENING',
        note: '',
      });
    }
    for (const line of input.timber) {
      const quantity = volume(line.quantity);
      const normalized = this.normalizeOpeningAmount(quantity, line.unitCost, line.amount, 4);
      if (quantity === '0.0000' && normalized.amount === '0.00') {
        continue;
      }
      items.push({
        targetType: 'TIMBER',
        lengthMm: line.lengthMm,
        widthMm: line.widthMm,
        heightMm: line.heightMm,
        bookQuantity: '0.0000',
        actualQuantity: quantity,
        differenceQuantity: quantity,
        unitCost: normalized.unitCost,
        amount: normalized.amount,
        reason: 'OPENING',
        note: '',
      });
    }
    if (items.length === 0) {
      throw problem(400, 'EMPTY_OPENING', '期初库存不能全为 0');
    }

    const created = await this.createAdjustmentWithRetry(
      input.openingDate,
      'OPENING',
      input.note,
      items,
      operator,
    );
    // 期初方木归属期初库存批次：保存时即创建，避免首次查询库存时写入
    await this.ensureOpeningBatch();
    return { ...created, type: 'opening' };
  }

  private todayIsoDate(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }

  private assertCountDate(countDate: string, openingDate: string): void {
    if (countDate > this.todayIsoDate()) {
      throw problem(400, 'COUNT_IN_FUTURE', '盘点日期不能晚于今天');
    }
    if (countDate < openingDate) {
      throw problem(400, 'COUNT_BEFORE_OPENING', '盘点日期不能早于期初日期');
    }
  }

  async createCount(
    input: InventoryCountInput,
    operator?: AdjustmentOperator,
  ): Promise<InventoryAdjustmentResultDto> {
    const summary = await this.getInventorySummary();
    if (summary.needsOpening || !summary.openingDate) {
      throw problem(400, 'COUNT_BEFORE_OPENING', '请先设置期初库存，再进行盘点');
    }
    this.assertCountDate(input.countDate, summary.openingDate);

    const items: Array<{
      targetType: 'RAW_LOG' | 'TIMBER';
      lengthMm: number | null;
      widthMm: number | null;
      heightMm: number | null;
      bookQuantity: string;
      actualQuantity: string;
      differenceQuantity: string;
      unitCost: string;
      amount: string;
      reason: 'MEASUREMENT' | 'MISSING' | 'DAMAGE' | 'OTHER';
      note: string;
    }> = [];

    if (input.targetType === 'raw_log') {
      // 实盘留空 = 本行不盘
      if (input.rawLog.actualQuantity !== undefined) {
        const rawBook = summary.raw.quantity;
        const rawActual = tons(input.rawLog.actualQuantity);
        const rawDiff = diffQuantity(rawActual, rawBook, 3);
        if (rawDiff !== '0.000') {
          items.push({
            targetType: 'RAW_LOG',
            lengthMm: null,
            widthMm: null,
            heightMm: null,
            bookQuantity: rawBook,
            actualQuantity: rawActual,
            differenceQuantity: rawDiff,
            unitCost: summary.raw.unitCost,
            amount: calcMaterialCostAmount(rawDiff, summary.raw.unitCost),
            reason: this.toReason(input.rawLog.reason),
            note: '',
          });
        }
      }
    } else {
      const timberBook = new Map(
        summary.timberLines.map((line) => [
          timberKey(line.lengthMm, line.widthMm, line.heightMm),
          line.quantity,
        ]),
      );
      for (const line of input.timber) {
        if (line.actualQuantity === undefined) {
          continue;
        }
        const key = timberKey(line.lengthMm, line.widthMm, line.heightMm);
        const book = timberBook.get(key) ?? '0.0000';
        const actual = volume(line.actualQuantity);
        const diff = diffQuantity(actual, book, 4);
        if (diff === '0.0000') {
          continue;
        }
        items.push({
          targetType: 'TIMBER',
          lengthMm: line.lengthMm,
          widthMm: line.widthMm,
          heightMm: line.heightMm,
          bookQuantity: book,
          actualQuantity: actual,
          differenceQuantity: diff,
          unitCost: summary.timber.unitCost,
          amount: calcMaterialCostAmount(diff, summary.timber.unitCost),
          reason: this.toReason(line.reason),
          note: '',
        });
      }
    }

    if (items.length === 0) {
      throw problem(400, 'COUNT_NO_LINES', '没有可调整的盘点行：实盘未填或与账面一致');
    }

    const created = await this.createAdjustmentWithRetry(
      input.countDate,
      'COUNT',
      input.note,
      items,
      operator,
    );
    return { ...created, type: 'count' };
  }

  private toReason(
    reason: string | undefined,
  ): 'MEASUREMENT' | 'MISSING' | 'DAMAGE' | 'OTHER' {
    switch (reason) {
      case 'measurement':
        return 'MEASUREMENT';
      case 'missing':
        return 'MISSING';
      case 'damage':
        return 'DAMAGE';
      default:
        return 'OTHER';
    }
  }

  private async createAdjustmentWithRetry(
    adjustmentDate: string,
    type: 'OPENING' | 'COUNT',
    note: string,
    items: Array<{
      targetType: 'RAW_LOG' | 'TIMBER';
      lengthMm: number | null;
      widthMm: number | null;
      heightMm: number | null;
      bookQuantity: string;
      actualQuantity: string;
      differenceQuantity: string;
      unitCost: string;
      amount: string;
      reason: 'OPENING' | 'MEASUREMENT' | 'MISSING' | 'DAMAGE' | 'OTHER';
      note: string;
    }>,
    operator?: AdjustmentOperator,
  ): Promise<InventoryAdjustmentResultDto> {
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt++) {
      try {
        const created = await this.prisma.client.$transaction(async (tx) => {
          const code = await this.nextAdjustmentCode(tx);
          const header = await tx.inventoryAdjustment.create({
            data: {
              tenantId: currentTenantId(),
              code,
              adjustmentDate: toDate(adjustmentDate),
              type,
              note,
              createdBy: operator?.id ?? null,
              createdByName: operator?.name ?? '',
            },
          });
          await tx.inventoryAdjustmentItem.createMany({
            data: items.map((item) => ({
              tenantId: currentTenantId(),
              ...item,
              adjustmentId: header.id,
            })),
          });
          return header;
        });
        return {
          id: created.id,
          code: created.code,
          type: type === 'OPENING' ? 'opening' : 'count',
          adjustmentDate: isoDate(created.adjustmentDate),
        };
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
}
