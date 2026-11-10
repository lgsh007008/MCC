import { SetMetadata } from '@nestjs/common';
import type { Scope } from '@mcc/shared';

// 接口所需权限（技术方案 §8.2）：守卫读取元数据并按角色矩阵判定，未声明则只校验登录态。
export const SCOPES_KEY = 'mcc:required-scopes';

export const RequireScopes = (...scopes: Scope[]): MethodDecorator & ClassDecorator =>
  SetMetadata(SCOPES_KEY, scopes);
