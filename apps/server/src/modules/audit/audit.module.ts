import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

// audit 模块：event_logs 数据主人；写作由 common 拦截器 / auth 显式调用，读取由 controller 暴露。
// Prisma 连接来自全局基础设施模块（common/prisma.module），本模块不重复提供。
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
