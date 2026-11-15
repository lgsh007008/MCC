import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { hasScope, type Scope } from '@mcc/shared';
import { AuditService } from '../../modules/audit/index.js';
import { runWithTenant } from '../../modules/tenant/index.js';
import type { AuthUser } from '../decorators/current-user.decorator.js';
import {
  AUDIT_ACTION_KEY,
  SKIP_AUDIT_KEY,
  type AuditActionMeta,
} from '../decorators/audit-action.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { SCOPES_KEY } from '../decorators/require-scopes.decorator.js';
import { auditRequestMeta, parseAuditPath } from '../audit.util.js';
import { problem } from '../http-problem.js';
import { isOpsRequest } from '../ops-path.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// 租户 scope 守卫（design/账号与权限.md §6）：接口以 @RequireScopes 声明，未声明则只校验登录态。
// 位于 FeatureGuard 之后（登录 → 租户状态 → feature → scope），身份由 AuthGuard 注入。
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (isOpsRequest(request.path)) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Scope[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const user = request.user;
    if (!user) {
      return true;
    }
    if (required.every((scope) => hasScope(user.role, scope))) {
      return true;
    }

    // 写操作的权限拒绝属于关键失败操作（product/审计日志.md）：守卫拦截后拦截器不会执行，需在此记录。
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!skip && WRITE_METHODS.has(request.method)) {
      const meta = this.reflector.getAllAndOverride<AuditActionMeta>(AUDIT_ACTION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      const fallback = parseAuditPath(request.path);
      const requestMeta = auditRequestMeta(request);
      void runWithTenant(user.tenantId, () =>
        this.audit.write({
          actorId: user.userId,
          actorUsername: user.username,
          actorRole: user.role,
          domain: meta?.domain ?? fallback.domain,
          action: meta?.action ?? fallback.action,
          actionLabel: meta?.label ?? null,
          objectType: meta?.objectType ?? null,
          objectId: typeof request.params?.id === 'string' ? request.params.id : null,
          objectCode: null,
          result: 'failed',
          statusCode: 403,
          errorCode: 'FORBIDDEN',
          method: request.method,
          path: request.path,
          ip: requestMeta.ip,
          userAgent: requestMeta.userAgent,
          requestId: requestMeta.requestId,
          payload: { requiredScopes: required },
        }),
      );
    }
    throw problem(403, 'FORBIDDEN', '当前角色无权限执行此操作');
  }
}
