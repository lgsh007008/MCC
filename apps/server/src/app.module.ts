import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './common/audit.interceptor.js';
import { AuthGuard } from './common/guards/auth.guard.js';
import { PrismaModule } from './common/prisma.module.js';
import { RateLimitGuard } from './common/rate-limit.guard.js';
import { RedisModule } from './common/redis.module.js';
import { AuditModule } from './modules/audit/index.js';
import { AuthModule } from './modules/auth/index.js';
import { CustomerModule } from './modules/customer/index.js';
import { FinanceModule } from './modules/finance/index.js';
import { OrderModule } from './modules/order/index.js';
import { PurchaseModule } from './modules/purchase/index.js';
import { SupplierModule } from './modules/supplier/index.js';

// 模块化单体的根模块。业务模块按领域在 src/modules/<domain>/ 下新增，
// 每个模块自带 Controller / Service / 表，并只通过 index.ts 对外暴露（技术方案 §4）。
@Module({
  imports: [
    // 全局基础设施（单一 Prisma/Redis 实例，供横切件与各模块共用）
    PrismaModule,
    RedisModule,
    AuditModule,
    AuthModule,
    CustomerModule,
    SupplierModule,
    FinanceModule,
    OrderModule,
    PurchaseModule,
  ],
  controllers: [],
  providers: [
    // 全局钩子顺序即执行顺序：先限流、再鉴权（技术方案 §8.4 / §8.2）
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    // 全量写操作审计（技术方案 §8.5）
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}