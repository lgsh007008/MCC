import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { FeatureCode } from '@mcc/shared';
import { TenantService } from '../../modules/tenant/index.js';
import type { AuthUser } from '../decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { FEATURE_KEY } from '../decorators/require-feature.decorator.js';
import { isOpsRequest } from '../ops-path.js';

// 功能闸门（design/账号与权限.md §6）：经 tenant 的 getEffectiveFeatures 判定套餐是否开通该功能。
// 顺序为登录 → 租户状态 → feature → scope；未声明 @RequireFeature 的接口不校验。
// 平台路由不经过功能闸门；基础功能（account / platform / tenant）永远启用，无需声明。
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantService: TenantService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<FeatureCode | undefined>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) {
      return true;
    }

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

    const user = request.user;
    if (!user) {
      return true;
    }

    await this.tenantService.assertFeature(user.tenantId, feature);
    return true;
  }
}
