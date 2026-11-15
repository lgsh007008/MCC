import { Module } from '@nestjs/common';
import { PlanController } from './plan.controller.js';
import { TenantController } from './tenant.controller.js';
import { TenantService } from './tenant.service.js';

// 租户领域模块（design/租户.md §1）：四张全局表数据主人。
// 单向依赖：auth 导入本模块；本模块不导入 auth，也不读写任何业务表。
// Prisma / Redis 连接来自全局基础设施模块，本模块不重复提供。
@Module({
  controllers: [TenantController, PlanController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
