import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { hasPlatformScope, type PlatformScope } from '@mcc/shared';
import { PlatformAuditService } from '../../modules/audit/index.js';
import { PlatformAuthService } from '../../modules/auth/index.js';
import { auditRequestMeta } from '../audit.util.js';
import type { PlatformAuthUser } from '../decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import {
  PLATFORM_AUDIT_ACTION_KEY,
  SKIP_PLATFORM_AUDIT_KEY,
  type PlatformAuditActionMeta,
} from '../decorators/platform-audit-action.decorator.js';
import { PLATFORM_SCOPES_KEY } from '../decorators/require-platform-scopes.decorator.js';
import { problem } from '../http-problem.js';
import { isOpsRequest } from '../ops-path.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// 平台身份守卫（design/账号与权限.md §6）：
// 只接管 /api/v1/ops 路由；校验平台访问令牌（aud = ops）与 @RequirePlatformScopes。
// 平台令牌不能访问租户业务接口，租户令牌也不能访问 /ops（AuthGuard 先放行，本守卫拒绝）。
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly platformAuthService: PlatformAuthService,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: PlatformAuthUser }>();
    if (!isOpsRequest(request.path)) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const user = this.platformAuthService.verifyAccessToken(token);
    request.user = user;

    const required = this.reflector.getAllAndOverride<PlatformScope[]>(PLATFORM_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (
      !required ||
      required.length === 0 ||
      required.every((scope) => hasPlatformScope(user.role, scope))
    ) {
      return true;
    }

    // 写操作的权限拒绝记录平台审计（守卫拦截后拦截器不会执行）
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_PLATFORM_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!skip && WRITE_METHODS.has(request.method)) {
      const meta = this.reflector.getAllAndOverride<PlatformAuditActionMeta>(
        PLATFORM_AUDIT_ACTION_KEY,
        [context.getHandler(), context.getClass()],
      );
      const requestMeta = auditRequestMeta(request);
      void this.platformAuditService.write({
        actorId: user.userId,
        actorUsername: user.username,
        domain: meta?.domain ?? 'platform',
        action: meta?.action ?? 'forbidden',
        actionLabel: meta?.label ?? null,
        targetTenantId:
          typeof request.params?.tenantId === 'string' ? request.params.tenantId : null,
        objectType: meta?.objectType ?? null,
        objectId: typeof request.params?.id === 'string' ? request.params.id : null,
        result: 'failed',
        statusCode: 403,
        errorCode: 'FORBIDDEN',
        method: request.method,
        path: request.path,
        ip: requestMeta.ip,
        userAgent: requestMeta.userAgent,
        requestId: requestMeta.requestId,
        payload: { requiredScopes: required },
      });
    }
    throw problem(403, 'FORBIDDEN', '当前平台账号无权限执行此操作');
  }
}
