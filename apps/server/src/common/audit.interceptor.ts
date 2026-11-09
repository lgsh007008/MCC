import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthUser } from './decorators/current-user.decorator.js';
import { PrismaService } from './prisma.service.js';

// 审计拦截器（横切中间件，技术方案 §8.5 / §1.1 common 职责）：
// 全量写操作（POST/PUT/PATCH/DELETE）落 audit 事件日志——主体、时间、对象、动作、结果；
// 审计日志只增不删（event_logs 表），失败也记录。日志写入失败不得打断业务响应。
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function parsePath(path: string): { domain: string; action: string } {
  const parts = path.split('/').filter(Boolean); // ['api', 'v1', '<domain>', '<action>', ...]
  return { domain: parts[2] ?? 'unknown', action: parts[3] ?? '' };
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!WRITE_METHODS.has(request.method)) {
      return next.handle();
    }
    const { domain, action } = parsePath(request.path);
    return next.handle().pipe(
      tap({
        next: () => {
          void this.writeLog(request, domain, action, 'ok');
        },
        error: (error: unknown) => {
          const result = error instanceof HttpException ? String(error.getStatus()) : 'error';
          void this.writeLog(request, domain, action, result);
        },
      }),
    );
  }

  private async writeLog(
    request: Request & { user?: AuthUser },
    domain: string,
    action: string,
    result: string,
  ): Promise<void> {
    try {
      await this.prisma.client.eventLog.create({
        data: {
          actorId: request.user?.userId ?? null,
          actorUsername: request.user?.username ?? null,
          domain,
          action,
          objectType: null,
          objectId: null,
          result,
          payload: { method: request.method, path: request.path },
        },
      });
    } catch {
      // 审计失败不打断业务（技术方案 §8.5 要求只增不删，写入失败另行监控）
    }
  }
}