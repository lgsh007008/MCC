import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@mcc/db';
import type { PlatformAuditLogQuery } from '@mcc/shared';
import { PrismaService } from '../../common/prisma.service.js';
import type {
  PlatformAuditLogItemDto,
  PlatformAuditLogListDto,
} from './dto/platform-audit.dto.js';

export interface PlatformAuditWriteInput {
  actorId?: string | null;
  actorUsername?: string | null;
  domain: string;
  action: string;
  actionLabel?: string | null;
  targetTenantId?: string | null;
  targetTenantCode?: string | null;
  targetTenantName?: string | null;
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

// 平台审计数据主人（design/审计日志.md §9）：platform_event_logs 全局表、无 tenant_id。
// 写入由 PlatformAuditInterceptor 与平台 auth 显式调用；读取由 PlatformAuditController 暴露。
// 只增不删；写入失败不阻塞业务。
@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(input: PlatformAuditWriteInput): Promise<void> {
    try {
      await this.prisma.client.platformEventLog.create({
        data: {
          actorId: input.actorId ?? null,
          actorUsername: input.actorUsername ?? null,
          domain: input.domain,
          action: input.action,
          actionLabel: input.actionLabel ?? null,
          targetTenantId: input.targetTenantId ?? null,
          targetTenantCode: input.targetTenantCode ?? null,
          targetTenantName: input.targetTenantName ?? null,
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
      this.logger.error(
        `平台审计写入失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async list(query: PlatformAuditLogQuery): Promise<PlatformAuditLogListDto> {
    const where: Prisma.PlatformEventLogWhereInput = {};
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
    if (query.action) {
      where.action = query.action;
    }
    if (query.result) {
      where.result = query.result;
    }
    if (query.targetTenant) {
      where.OR = [
        { targetTenantCode: { contains: query.targetTenant, mode: 'insensitive' } },
        { targetTenantName: { contains: query.targetTenant, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.client.platformEventLog.count({ where }),
      this.prisma.client.platformEventLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          createdAt: true,
          actorId: true,
          actorUsername: true,
          domain: true,
          action: true,
          actionLabel: true,
          targetTenantId: true,
          targetTenantCode: true,
          targetTenantName: true,
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

    const items: PlatformAuditLogItemDto[] = rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
    return { total, items };
  }
}
