import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@mcc/db';
import type { AuditLogQuery } from '@mcc/shared';
import { PrismaService } from '../../common/prisma.service.js';
import type { AuditLogItemDto, AuditLogListDto } from './dto/audit.dto.js';

export interface AuditWriteInput {
  actorId?: string | null;
  actorUsername?: string | null;
  actorRole?: string | null;
  domain: string;
  action: string;
  actionLabel?: string | null;
  objectType?: string | null;
  objectId?: string | null;
  objectCode?: string | null;
  result: 'ok' | 'failed';
  statusCode?: number | null;
  errorCode?: string | null;
  method?: string | null;
  path?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  payload?: Prisma.InputJsonValue;
}

// audit 模块是 event_logs 的数据主人（design/审计日志.md §1）：
// 写入由全局拦截器 / auth 显式调用，读取由 controller 暴露；写入失败不阻塞业务。
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(input: AuditWriteInput): Promise<void> {
    try {
      await this.prisma.client.eventLog.create({
        data: {
          actorId: input.actorId ?? null,
          actorUsername: input.actorUsername ?? null,
          actorRole: input.actorRole ?? null,
          domain: input.domain,
          action: input.action,
          actionLabel: input.actionLabel ?? null,
          objectType: input.objectType ?? null,
          objectId: input.objectId ?? null,
          objectCode: input.objectCode ?? null,
          result: input.result,
          statusCode: input.statusCode ?? null,
          errorCode: input.errorCode ?? null,
          method: input.method ?? null,
          path: input.path ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          requestId: input.requestId ?? null,
          payload: input.payload,
        },
      });
    } catch (error) {
      // 审计失败不打断业务（product/审计日志.md「边界」）；错误进技术日志供排障。
      this.logger.error(`审计写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async list(query: AuditLogQuery): Promise<AuditLogListDto> {
    const where: Prisma.EventLogWhereInput = {};
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(`${query.dateFrom}T00:00:00`);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(`${query.dateTo}T23:59:59.999`);
      }
    }
    if (query.actor) {
      where.actorUsername = { contains: query.actor, mode: 'insensitive' };
    }
    if (query.domain) {
      where.domain = query.domain;
    }
    if (query.action) {
      where.action = query.action;
    }
    if (query.result) {
      where.result = query.result;
    }

    const [total, rows] = await Promise.all([
      this.prisma.client.eventLog.count({ where }),
      this.prisma.client.eventLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          createdAt: true,
          actorId: true,
          actorUsername: true,
          actorRole: true,
          domain: true,
          action: true,
          actionLabel: true,
          objectType: true,
          objectId: true,
          objectCode: true,
          result: true,
          statusCode: true,
          errorCode: true,
          ip: true,
          userAgent: true,
          requestId: true,
        },
      }),
    ]);

    const items: AuditLogItemDto[] = rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
    return { total, items };
  }
}
