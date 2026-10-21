import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from '../../modules/auth/index.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { problem } from '../http-problem.js';

// 鉴权守卫（横切中间件，归 common，design/账号与权限.md §1）：
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

    if (user.role !== 'SALES') {
      // RBAC（角色 → scope）：当前单角色「销售」全权限，非该角色一律拒绝；
      // scope 裁剪待新增角色需求（product/账号与权限.md）再展开。
      throw problem(403, 'FORBIDDEN', '当前角色无权限执行此操作');
    }
    return true;
  }
}