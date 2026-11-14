import { Injectable } from '@nestjs/common';
import { Prisma } from '@mcc/db';
import type {
  SupplierBatchDeleteInput,
  SupplierBatchStatusInput,
  SupplierInput,
  SupplierListQuery,
  SupplierNameCheckQuery,
  SupplierStatusInput,
  SupplierUpdateInput,
} from '@mcc/shared';
import { problem } from '../../common/http-problem.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { SupplierDto, SupplierListDto } from './dto/supplier.dto.js';

// 供应商档案（product/supplier.md R-供应商-001；design/supplier.md）。
// 编号 SP + 连字符 + 5 位全局流水；名称不唯一（重名只提示）；停用不可被新采购单选择。
// 累计采购 / 累计付款 / 应付不落本表：由 finance 聚合；唯一金额列是期初应付。

const CODE_RETRY_LIMIT = 3;
const CODE_PREFIX = 'SP-';
const CODE_PAD = 5;

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

interface SupplierRow {
  id: string;
  code: string;
  name: string;
  contact: string;
  status: 'ACTIVE' | 'INACTIVE';
  note: string;
  openingPayable: Prisma.Decimal;
  createdAt: Date;
}

const toDto = (row: SupplierRow): SupplierDto => ({
  id: row.id,
  code: row.code,
  name: row.name,
  contact: row.contact,
  status: row.status === 'ACTIVE' ? 'active' : 'inactive',
  note: row.note,
  openingPayable: row.openingPayable.toFixed(2),
  createdAt: isoDate(row.createdAt),
});

export interface SelectableSupplier {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  deleted?: boolean;
}

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) {}

  // 编号：取当前最大流水 +1（design/supplier.md §3）；唯一约束兜底并发，冲突重试。
  private nextCode(tx: Prisma.TransactionClient): Promise<string> {
    return tx.supplier
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

  async list(query: SupplierListQuery): Promise<SupplierListDto> {
    const where: Prisma.SupplierWhereInput = { deletedAt: null };
    if (query.name) {
      where.name = { contains: query.name };
    }
    if (query.status) {
      where.status = query.status === 'active' ? 'ACTIVE' : 'INACTIVE';
    }
    const [total, rows] = await Promise.all([
      this.prisma.client.supplier.count({ where }),
      this.prisma.client.supplier.findMany({
        where,
        // 排序（页面模式规范：表头正/倒序）；code 作次级排序保证翻页稳定
        orderBy: [
          { createdAt: query.sortOrder === 'asc' ? 'asc' : 'desc' },
          { code: 'desc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          code: true,
          name: true,
          contact: true,
          status: true,
          note: true,
          openingPayable: true,
          createdAt: true,
        },
      }),
    ]);
    return { total, items: rows.map((row) => toDto(row)) };
  }

  async detail(id: string): Promise<SupplierDto> {
    const row = await this.prisma.client.supplier.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        contact: true,
        status: true,
        note: true,
        openingPayable: true,
        createdAt: true,
      },
    });
    if (!row) {
      throw problem(404, 'NOT_FOUND', '供应商不存在');
    }
    return toDto(row);
  }

  async create(input: SupplierInput): Promise<SupplierDto> {
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt++) {
      try {
        const row = await this.prisma.client.$transaction(async (tx) => {
          const code = await this.nextCode(tx);
          return tx.supplier.create({
            data: {
              code,
              name: input.name,
              contact: input.contact,
              openingPayable: input.openingPayable,
              note: input.note,
            },
            select: {
              id: true,
              code: true,
              name: true,
              contact: true,
              status: true,
              note: true,
              openingPayable: true,
              createdAt: true,
            },
          });
        });
        return toDto(row);
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

  async update(id: string, input: SupplierUpdateInput): Promise<SupplierDto> {
    const result = await this.prisma.client.supplier.updateMany({
      where: { id, deletedAt: null },
      data: {
        name: input.name,
        contact: input.contact,
        openingPayable: input.openingPayable,
        note: input.note,
      },
    });
    if (result.count === 0) {
      throw problem(404, 'NOT_FOUND', '供应商不存在');
    }
    return this.detail(id);
  }

  async setStatus(id: string, input: SupplierStatusInput): Promise<SupplierDto> {
    const result = await this.prisma.client.supplier.updateMany({
      where: { id, deletedAt: null },
      data: { status: input.status === 'active' ? 'ACTIVE' : 'INACTIVE' },
    });
    if (result.count === 0) {
      throw problem(404, 'NOT_FOUND', '供应商不存在');
    }
    return this.detail(id);
  }

  async setStatusMany(input: SupplierBatchStatusInput): Promise<{ updated: number }> {
    const target = input.status === 'active' ? 'ACTIVE' : 'INACTIVE';
    const result = await this.prisma.client.supplier.updateMany({
      where: {
        id: { in: input.ids },
        deletedAt: null,
        status: { not: target },
      },
      data: { status: target },
    });
    return { updated: result.count };
  }

  async removeMany(input: SupplierBatchDeleteInput): Promise<{ deleted: number }> {
    const result = await this.prisma.client.supplier.updateMany({
      where: { id: { in: input.ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count };
  }

  async remove(id: string): Promise<void> {
    const result = await this.prisma.client.supplier.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw problem(404, 'NOT_FOUND', '供应商不存在');
    }
  }

  async nameCheck(query: SupplierNameCheckQuery): Promise<{ duplicate: boolean }> {
    const count = await this.prisma.client.supplier.count({
      where: {
        name: query.name,
        deletedAt: null,
        ...(query.excludeId ? { id: { not: query.excludeId } } : {}),
      },
    });
    return { duplicate: count > 0 };
  }

  // ── 公开接口（供 purchase / finance 跨模块调用，技术方案 §4.2）──────────

  // 校验供应商存在且为启用态：新建采购单或更换供应商时调用。
  async assertSelectable(id: string): Promise<SelectableSupplier> {
    const row = await this.prisma.client.supplier.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, code: true, name: true, status: true },
    });
    if (!row) {
      throw problem(400, 'SUPPLIER_NOT_FOUND', '供应商不存在');
    }
    if (row.status !== 'ACTIVE') {
      throw problem(400, 'SUPPLIER_INACTIVE', '供应商已停用，不能开新单');
    }
    return { id: row.id, code: row.code, name: row.name, status: row.status };
  }

  // 取供应商基本信息（供财务取名称快照）：包含已软删记录并返回 deleted 标志。
  async findById(id: string): Promise<SelectableSupplier | null> {
    const row = await this.prisma.client.supplier.findFirst({
      where: { id },
      select: { id: true, code: true, name: true, status: true, deletedAt: true },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      deleted: row.deletedAt !== null,
    };
  }

  // 批量取期初应付（供 finance 批量计算应付）：返回 id → 金额字符串；含已软删记录。
  async findOpeningPayables(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.client.supplier.findMany({
      where: { id: { in: ids } },
      select: { id: true, openingPayable: true },
    });
    return new Map(rows.map((row) => [row.id, row.openingPayable.toFixed(2)]));
  }
}
