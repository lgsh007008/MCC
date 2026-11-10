import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { hasScope, type Scope } from '@mcc/shared';
import { AuthService } from '../../modules/auth/index.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { SCOPES_KEY } from '../decorators/require-scopes.decorator.js';
import { problem } from '../http-problem.js';

// 鉴权守卫（横切中间件，归 common，design/账号与权限.md §1、§6）：
// 校验统一在服务层完成（技术方案 §8.2），前端不做安全判断。
// 通过 auth 模块的公开接口消费凭证校验，不内嵌令牌逻辑。
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
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
      throw problem(403, 'FORBIDDEN', '当前角色无权限执行此操作');
    }
    return true;
  }
}