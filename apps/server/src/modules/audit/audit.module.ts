import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { PlatformAuditController } from './platform-audit.controller.js';
import { PlatformAuditService } from './platform-audit.service.js';

// audit 模块：event_logs（租户）与 platform_event_logs（平台）两张表的数据主人。
// 写入由 common 拦截器 / auth 显式调用，读取由各自 controller 暴露。
// Prisma 连接来自全局基础设施模块（common/prisma.module），本模块不重复提供。
@Module({
  controllers: [AuditController, PlatformAuditController],
  providers: [AuditService, PlatformAuditService],
  exports: [AuditService, PlatformAuditService],
})
export class AuditModule {}
