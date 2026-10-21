import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// 全服务唯一的 PrismaClient 提供方（技术方案 §1.2：server 是唯一访问数据库的进程）。
// Global：审计拦截器、鉴赏守卫等横切件与各业务模块共用同一实例，避免多实例连接。
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}