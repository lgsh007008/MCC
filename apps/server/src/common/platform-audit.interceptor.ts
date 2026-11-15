import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { PlatformAuditService } from '../modules/audit/index.js';
import { TenantService } from '../modules/tenant/index.js';
import { auditRequestMeta } from './audit.util.js';
import type { PlatformAuthUser } from './decorators/current-user.decorator.js';
import {
  PLATFORM_AUDIT_ACTION_KEY,
  SKIP_PLATFORM_AUDIT_KEY,
  type PlatformAuditActionMeta,
} from './decorators/platform-audit-action.decorator.js';
import { isOpsRequest, OPS_PATH_PREFIX } from './ops-path.js';

// 平台审计拦截器（design/审计日志.md §9）：
// 仅处理 /api/v1/ops/** 的写方法；接口用 @PlatformAuditAction 声明语义，禁止依赖 URL 猜动作。
// 目标租户：租户相关路由取 params.tenantId / params.id，并用响应体快照覆盖；
// 平台账号路由（/ops/accounts*）一律为空，避免把平台账号 id 误记为租户。
// 审计写入失败不得打断业务响应（PlatformAuditService 内部兜底）。
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type RequestWithUser = Request & { user?: PlatformAuthUser };

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

@Injectable()
export class PlatformAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly platformAudit: PlatformAuditService,
    private readonly tenantService: TenantService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!WRITE_METHODS.has(request.method) || !isOpsRequest(request.path)) {
      return next.handle();
    }

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_PLATFORM_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }

    const meta = this.reflector.getAllAndOverride<PlatformAuditActionMeta>(
      PLATFORM_AUDIT_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();

    return next.handle().pipe(
      tap({
        next: (result: unknown) => {
          void this.write(request, {
            meta,
            resultRecord: isRecord(result) ? result : undefined,
            result: 'ok',
            statusCode: response.statusCode,
            errorCode: null,
          });
        },
        error: (error: unknown) => {
          void this.write(request, {
            meta,
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
      meta: PlatformAuditActionMeta | undefined;
      resultRecord: Record<string, unknown> | undefined;
      result: 'ok' | 'failed';
      statusCode: number;
      errorCode: string | null;
    },
  ): Promise<void> {
    const target = await this.resolveTarget(request, input.resultRecord);
    const requestMeta = auditRequestMeta(request);
    const params = (request.params ?? {}) as Record<string, unknown>;
    const objectId =
      (typeof params.userId === 'string' ? params.userId : null) ??
      (typeof params.id === 'string' ? params.id : null) ??
      (input.resultRecord && typeof input.resultRecord.id === 'string'
        ? input.resultRecord.id
        : null);
    const objectCode =
      input.resultRecord && typeof input.resultRecord.code === 'string'
        ? input.resultRecord.code
        : input.resultRecord && typeof input.resultRecord.username === 'string'
          ? input.resultRecord.username
          : null;

    await this.platformAudit.write({
      actorId: request.user?.userId ?? null,
      actorUsername: request.user?.username ?? null,
      domain: input.meta?.domain ?? 'platform',
      action: input.meta?.action ?? `${request.method.toLowerCase()}-unknown`,
      actionLabel: input.meta?.label ?? null,
      targetTenantId: target?.id ?? null,
      targetTenantCode: target?.code ?? null,
      targetTenantName: target?.name ?? null,
      objectType: input.meta?.objectType ?? null,
      objectId,
      objectCode,
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

  private async resolveTarget(
    request: RequestWithUser,
    response: Record<string, unknown> | undefined,
  ): Promise<{ id: string; code: string | null; name: string | null } | null> {
    // 平台账号接口不属于任何租户
    if (request.path.startsWith(`${OPS_PATH_PREFIX}/accounts`)) {
      return null;
    }
    const tenantPath =
      request.path === `${OPS_PATH_PREFIX}/tenants` ||
      request.path.startsWith(`${OPS_PATH_PREFIX}/tenants/`);
    if (!tenantPath) {
      return null;
    }

    const params = (request.params ?? {}) as Record<string, unknown>;
    const targetId =
      (typeof params.tenantId === 'string' ? params.tenantId : null) ??
      (typeof params.id === 'string' ? params.id : null) ??
      (response && typeof response.tenantId === 'string' ? response.tenantId : null) ??
      (response && typeof response.id === 'string' ? response.id : null);
    if (!targetId) {
      return null;
    }

    const code = response && typeof response.code === 'string' ? response.code : null;
    const name = response && typeof response.name === 'string' ? response.name : null;
    if (code) {
      return { id: targetId, code, name };
    }
    // 补建管理员 / 重置密码等响应不含租户快照，回查一次补全编号与名称
    const tenant = await this.tenantService.findById(targetId);
    return tenant
      ? { id: tenant.id, code: tenant.code, name: tenant.name }
      : { id: targetId, code: null, name: null };
  }
}
