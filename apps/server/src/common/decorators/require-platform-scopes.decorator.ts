import { SetMetadata } from '@nestjs/common';
import type { PlatformScope } from '@mcc/shared';

// 平台接口所需权限（design/账号与权限.md §6）：PlatformAuthGuard 读取元数据，
// 按 PLATFORM_ROLE_SCOPES 判定；platform:tenant:manage 自动包含 platform:tenant:view。
export const PLATFORM_SCOPES_KEY = 'mcc:required-platform-scopes';

export const RequirePlatformScopes = (
  ...scopes: PlatformScope[]
): MethodDecorator & ClassDecorator => SetMetadata(PLATFORM_SCOPES_KEY, scopes);
