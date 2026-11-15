import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from '../../modules/auth/index.js';
import { TenantService } from '../../modules/tenant/index.js';
import type { AuthUser } from '../decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { problem } from '../http-problem.js';
import { isOpsRequest } from '../ops-path.js';

// 租户身份守卫（横切中间件，归 common，design/账号与权限.md §6）：
// 1. 校验租户访问令牌（aud = web）；2. 校验租户启用状态；3. 校验签发 epoch 未失效。
// scope 与功能闸门分别由 ScopeGuard / FeatureGuard 判定（顺序：登录 → 租户状态 → feature → scope）。
// 平台路由（/api/v1/ops）由 PlatformAuthGuard 接管，本守卫放行。
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly tenantService: TenantService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (isOpsRequest(request.path)) {
      return true;
    }

    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const user = this.authService.verifyAccessToken(token);

    // 停用租户即时拒绝；启用后 epoch 已递增，旧令牌一律失效（需重新登录）
    const tenant = await this.tenantService.assertActiveById(user.tenantId);
    if (tenant.sessionEpoch !== user.tenantEpoch) {
      throw problem(401, 'TOKEN_INVALID', '登录状态已失效，请重新登录');
    }

    // 身份与权限一律来自服务层解析，注入请求上下文供 CurrentUser 使用
    (request as Request & { user?: AuthUser }).user = user;
    return true;
  }
}
