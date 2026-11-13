import { Injectable } from '@nestjs/common';
import { Prisma } from '@mcc/db';
import type {
  CustomerBatchDeleteInput,
  CustomerBatchStatusInput,
  CustomerInput,
  CustomerListQuery,
  CustomerNameCheckQuery,
  CustomerStatusInput,
  CustomerUpdateInput,
} from '@mcc/shared';
import { problem } from '../../common/http-problem.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { CustomerDto, CustomerListDto } from './dto/customer.dto.js';

// 客户档案（product/customer.md R-客户-001；design/customer.md）。
// 编号 CT + 连字符 + 5 位全局流水（不含日期，见 1-产品文档.md 五）；名称不唯一（重名只提示）；
// 停用不可被新单选择；不提供删除。累计下单方量不落本表：由 order 域按未软删销售单聚合。

const CODE_RETRY_LIMIT = 3;
const CODE_PREFIX = 'CT-';
const CODE_PAD = 5;

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

interface CustomerRow {
  id: string;
  code: string;
  name: string;
  contact: string;
  status: 'ACTIVE' | 'INACTIVE';
  note: string;
  openingDebt: Prisma.Decimal;
  createdAt: Date;
}

const toDto = (row: CustomerRow): CustomerDto => ({
  id: row.id,
  code: row.code,
  name: row.name,
  contact: row.contact,
  status: row.status === 'ACTIVE' ? 'active' : 'inactive',
  note: row.note,
  openingDebt: row.openingDebt.toFixed(2),
  createdAt: isoDate(row.createdAt),
});

export interface SelectableCustomer {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  deleted?: boolean;
}

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  // 编号：取当前最大流水 +1（design/customer.md §3）；唯一约束兜底并发，冲突重试。
  private nextCode(tx: Prisma.TransactionClient): Promise<string> {
    return tx.customer
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

  async list(query: CustomerListQuery): Promise<CustomerListDto> {
    const where: Prisma.CustomerWhereInput = { deletedAt: null };
    if (query.name) {
      where.name = { contains: query.name };
    }
    if (query.status) {
      where.status = query.status === 'active' ? 'ACTIVE' : 'INACTIVE';
    }
    const [total, rows] = await Promise.all([
      this.prisma.client.customer.count({ where }),
      this.prisma.client.customer.findMany({
        where,
        orderBy: { createdAt: query.sortOrder === 'asc' ? 'asc' : 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          code: true,
          name: true,
          contact: true,
          status: true,
          note: true,
          openingDebt: true,
          createdAt: true,
        },
      }),
    ]);
    return { total, items: rows.map((row) => toDto(row)) };
  }

  async detail(id: string): Promise<CustomerDto> {
    const row = await this.prisma.client.customer.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        contact: true,
        status: true,
        note: true,
        openingDebt: true,
        createdAt: true,
      },
    });
    if (!row) {
      throw problem(404, 'NOT_FOUND', '客户不存在');
    }
    return toDto(row);
  }

  async create(input: CustomerInput): Promise<CustomerDto> {
    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt++) {
      try {
        const row = await this.prisma.client.$transaction(async (tx) => {
          const code = await this.nextCode(tx);
          return tx.customer.create({
            data: {
              code,
              name: input.name,
              contact: input.contact,
              openingDebt: input.openingDebt,
              note: input.note,
            },
            select: {
              id: true,
              code: true,
              name: true,
              contact: true,
              status: true,
              note: true,
              openingDebt: true,
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

  async update(id: string, input: CustomerUpdateInput): Promise<CustomerDto> {
    const result = await this.prisma.client.customer.updateMany({
      where: { id, deletedAt: null },
      data: {
        name: input.name,
        contact: input.contact,
        openingDebt: input.openingDebt,
        note: input.note,
      },
    });
    if (result.count === 0) {
      throw problem(404, 'NOT_FOUND', '客户不存在');
    }
    return this.detail(id);
  }

  async setStatus(id: string, input: CustomerStatusInput): Promise<CustomerDto> {
    const result = await this.prisma.client.customer.updateMany({
      where: { id, deletedAt: null },
      data: { status: input.status === 'active' ? 'ACTIVE' : 'INACTIVE' },
    });
    if (result.count === 0) {
      throw problem(404, 'NOT_FOUND', '客户不存在');
    }
    return this.detail(id);
  }

  // 批量启用 / 停用（product/customer.md 列表页批量操作）：
  // 只更新与目标状态不同的未删行，已处于目标状态 / 不存在 / 已删的静默跳过，返回实际变更条数。
  async setStatusMany(input: CustomerBatchStatusInput): Promise<{ updated: number }> {
    const target = input.status === 'active' ? 'ACTIVE' : 'INACTIVE';
    const result = await this.prisma.client.customer.updateMany({
      where: {
        id: { in: input.ids },
        deletedAt: null,
        status: { not: target },
      },
      data: { status: target },
    });
    return { updated: result.count };
  }

  // 批量删除（软删除；不存在 / 已删的静默跳过）
  async removeMany(input: CustomerBatchDeleteInput): Promise<{ deleted: number }> {
    const result = await this.prisma.client.customer.updateMany({
      where: { id: { in: input.ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count };
  }

  // 删除 = 软删除（product/customer.md 删除规则）：编号不回收；已删返回 404
  async remove(id: string): Promise<void> {
    const result = await this.prisma.client.customer.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw problem(404, 'NOT_FOUND', '客户不存在');
    }
  }

  // 重名检查（product/customer.md 重名规则）：只提示不阻断，故单独提供轻量查询。
  async nameCheck(query: CustomerNameCheckQuery): Promise<{ duplicate: boolean }> {
    const count = await this.prisma.client.customer.count({
      where: {
        name: query.name,
        deletedAt: null,
        ...(query.excludeId ? { id: { not: query.excludeId } } : {}),
      },
    });
    return { duplicate: count > 0 };
  }

  // ── 公开接口（供 order 等模块跨模块调用，技术方案 §4.2）──────────────

  // 校验客户存在且为启用态：新建单或更换客户时调用；停用客户拒绝。
  async assertSelectable(id: string): Promise<SelectableCustomer> {
    const row = await this.prisma.client.customer.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, code: true, name: true, status: true },
    });
    if (!row) {
      throw problem(400, 'CUSTOMER_NOT_FOUND', '客户不存在');
    }
    if (row.status !== 'ACTIVE') {
      throw problem(400, 'CUSTOMER_INACTIVE', '客户已停用，不能开新单');
    }
    return { id: row.id, code: row.code, name: row.name, status: row.status };
  }

  // 取客户基本信息（供订单详情展示编号等）：包含已软删记录并返回 deleted 标志，
  // 历史订单据此标注「已删除」；新单校验仍走 assertSelectable（排除已删）。
  async findById(id: string): Promise<SelectableCustomer | null> {
    const row = await this.prisma.client.customer.findFirst({
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

  // 批量取期初欠款（供 finance 批量计算应收，design/customer.md §5）：
  // 返回 id → 金额字符串；包含已软删记录，保证历史应收口径不因删除而漂移。
  async findOpeningDebts(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.client.customer.findMany({
      where: { id: { in: ids } },
      select: { id: true, openingDebt: true },
    });
    return new Map(rows.map((row) => [row.id, row.openingDebt.toFixed(2)]));
  }
}
