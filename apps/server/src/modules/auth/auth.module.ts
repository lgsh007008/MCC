import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/index.js';
import { TenantModule } from '../tenant/index.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PlatformAuthController } from './platform-auth.controller.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { PlatformUsersController } from './platform-users.controller.js';
import { PlatformUsersService } from './platform-users.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

// 平台机制模块（非业务模块），遵循技术方案 §4.1 四件套模板；
// users / refresh_tokens / platform_users / platform_refresh_tokens 四张表归本模块。
// 单向依赖：本模块导入 tenant（登录解析租户、额度、有效功能）；tenant 不导入本模块。
// Prisma/Redis 连接来自全局基础设施模块（common/prisma.module、common/redis.module），本模块不重复提供。
@Module({
  imports: [AuditModule, TenantModule],
  controllers: [
    AuthController,
    UsersController,
    PlatformAuthController,
    PlatformUsersController,
  ],
  providers: [AuthService, UsersService, PlatformAuthService, PlatformUsersService],
  exports: [AuthService, PlatformAuthService],
})
export class AuthModule {}
