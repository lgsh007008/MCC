import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

// 平台机制模块（非业务模块），遵循技术方案 §4.1 四件套模板；
// user / refresh_token 表归本模块（数据所有权，技术方案 §4.2）。
// Prisma/Redis 连接来自全局基础设施模块（common/prisma.module、common/redis.module），本模块不重复提供。
@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}