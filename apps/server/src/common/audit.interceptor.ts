import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthUser } from './decorators/current-user.decorator.js';
import {
  AUDIT_ACTION_KEY,
  SKIP_AUDIT_KEY,
  type AuditActionMeta,
} from './decorators/audit-action.decorator.js';
import { auditRequestMeta, parseAuditPath } from './audit.util.js';
import { AuditService } from '../modules/audit/index.js';

// 审计拦截器（design/审计日志.md §3）：
// 所有写方法按 @AuditAction 元数据落审计；登录/登出/刷新由 auth 显式记录并 @SkipAudit。
// 审计写入失败不得打断业务响应（AuditService 内部兜底）。
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type RequestWithUser = Request & { user?: AuthUser };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function errorCodeOf(error: unknown): string | null {
  if (!(error instanceof HttpException)) {
    return null;
  }
  const response = error.getResponse();
  if (!isRecord(response) || typeof response.code !== 'string') {
    return null;
  }
  return response.code;
}

function statusOf(error: unknown): number {
  return error instanceof HttpException ? error.getStatus() : 500;
}

function resolveObjectId(
  request: RequestWithUser,
  meta: AuditActionMeta | undefined,
  response: Record<string, unknown> | undefined,
): string | null {
  const paramId = typeof request.params?.id === 'string' ? request.params.id : null;
  if (paramId) {
    return paramId;
  }
  if (meta?.objectType === 'user' && request.user?.userId) {
    return request.user.userId;
  }
  if (response && typeof response.id === 'string') {
    return response.id;
  }
  const body = isRecord(request.body) ? request.body : undefined;
  return body && typeof body.id === 'string' ? body.id : null;
}

function resolveObjectCode(
  request: RequestWithUser,
  meta: AuditActionMeta | undefined,
  response: Record<string, unknown> | undefined,
): string | null {
  if (response && typeof response.code === 'string') {
    return response.code;
  }
  if (response && typeof response.username === 'string') {
    return response.username;
  }
  const hasParamId = typeof request.params?.id === 'string';
  return meta?.objectType === 'user' && !hasParamId ? request.user?.username ?? null : null;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!WRITE_METHODS.has(request.method)) {
      return next.handle();
    }
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }

    const meta = this.reflector.getAllAndOverride<AuditActionMeta>(AUDIT_ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const fallback = parseAuditPath(request.path);
    const domain = meta?.domain ?? fallback.domain;
    const action = meta?.action ?? fallback.action;
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();

    return next.handle().pipe(
      tap({
        next: (result: unknown) => {
          const resultRecord = isRecord(result) ? result : undefined;
          void this.write(request, {
            meta,
            domain,
            action,
            resultRecord,
            result: 'ok',
            statusCode: response.statusCode,
            errorCode: null,
          });
        },
        error: (error: unknown) => {
          void this.write(request, {
            meta,
            domain,
            action,
            resultRecord: undefined,
            result: 'failed',
            statusCode: statusOf(error),
            errorCode: errorCodeOf(error),
          });
        },
      }),
    );
  }

  private async write(
    request: RequestWithUser,
    input: {
      meta: AuditActionMeta | undefined;
      domain: string;
      action: string;
      resultRecord: Record<string, unknown> | undefined;
      result: 'ok' | 'failed';
      statusCode: number;
      errorCode: string | null;
    },
  ): Promise<void> {
    const requestMeta = auditRequestMeta(request);
    await this.audit.write({
      actorId: request.user?.userId ?? null,
      actorUsername: request.user?.username ?? null,
      actorRole: request.user?.role ?? null,
      domain: input.domain,
      action: input.action,
      actionLabel: input.meta?.label ?? null,
      objectType: input.meta?.objectType ?? null,
      objectId: resolveObjectId(request, input.meta, input.resultRecord),
      objectCode: resolveObjectCode(request, input.meta, input.resultRecord),
      result: input.result,
      statusCode: input.statusCode,
      errorCode: input.errorCode,
      method: request.method,
      path: request.path,
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
      requestId: requestMeta.requestId,
      payload: { method: request.method, path: request.path },
    });
  }
}
