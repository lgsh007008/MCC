import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { hasScope, type Scope } from '@mcc/shared';
import { AuditService } from '../../modules/audit/index.js';
import { AuthService } from '../../modules/auth/index.js';
import { auditRequestMeta, parseAuditPath } from '../audit.util.js';
import {
  AUDIT_ACTION_KEY,
  SKIP_AUDIT_KEY,
  type AuditActionMeta,
} from '../decorators/audit-action.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { SCOPES_KEY } from '../decorators/require-scopes.decorator.js';
import { problem } from '../http-problem.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// 鉴权守卫（横切中间件，归 common，design/账号与权限.md §1、§6）：
// 校验统一在服务层完成（技术方案 §8.2），前端不做安全判断。
// 通过 auth 模块的公开接口消费凭证校验，不内嵌令牌逻辑。
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
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

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const user = this.authService.verifyAccessToken(token);
    // 身份与权限一律来自服务层解析，注入请求上下文供 CurrentUser 使用
    (request as Request & { user?: unknown }).user = user;

    // RBAC（角色 → scope）：接口以 @RequireScopes 声明，未声明则只校验登录态。
    const required = this.reflector.getAllAndOverride<Scope[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0 && !required.every((scope) => hasScope(user.role, scope))) {
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
        void this.audit.write({
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
        });
      }
      throw problem(403, 'FORBIDDEN', '当前角色无权限执行此操作');
    }
    return true;
  }
}