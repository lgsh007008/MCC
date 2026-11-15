import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './common/audit.interceptor.js';
import { HealthController } from './common/health.controller.js';
import { AuthGuard } from './common/guards/auth.guard.js';
import { FeatureGuard } from './common/guards/feature.guard.js';
import { PlatformAuthGuard } from './common/guards/platform-auth.guard.js';
import { ScopeGuard } from './common/guards/scope.guard.js';
import { PlatformAuditInterceptor } from './common/platform-audit.interceptor.js';
import { PrismaModule } from './common/prisma.module.js';
import { RateLimitGuard } from './common/rate-limit.guard.js';
import { RedisModule } from './common/redis.module.js';
import { TenantContextInterceptor } from './common/tenant-context.interceptor.js';
import { AuditModule } from './modules/audit/index.js';
import { AuthModule } from './modules/auth/index.js';
import { CustomerModule } from './modules/customer/index.js';
import { FinanceModule } from './modules/finance/index.js';
import { OrderModule } from './modules/order/index.js';
import { ProductionModule } from './modules/production/index.js';
import { PurchaseModule } from './modules/purchase/index.js';
import { SupplierModule } from './modules/supplier/index.js';
import { TenantModule } from './modules/tenant/index.js';

// 模块化单体的根模块。业务模块按领域在 src/modules/<domain>/ 下新增，
// 每个模块自带 Controller / Service / 表，并只通过 index.ts 对外暴露（技术方案 §4）。
@Module({
  imports: [
    // 全局基础设施（单一 Prisma/Redis 实例，供横切件与各模块共用）
    PrismaModule,
    RedisModule,
    AuditModule,
    TenantModule,
    AuthModule,
    CustomerModule,
    SupplierModule,
    FinanceModule,
    ProductionModule,
    OrderModule,
    PurchaseModule,
  ],
  controllers: [HealthController],
  providers: [
    // 全局钩子顺序即执行顺序（技术方案 §8.4 / §8.2）：
    // 限流 → 租户登录态与租户状态 → 功能闸门 → 租户 scope → 平台身份
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
    { provide: APP_GUARD, useClass: ScopeGuard },
    { provide: APP_GUARD, useClass: PlatformAuthGuard },
    // 租户上下文先注入，审计拦截器随后按当前租户落库（技术方案 §8.5）
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: PlatformAuditInterceptor },
  ],
})
export class AppModule {}
