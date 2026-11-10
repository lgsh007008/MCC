import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';

// 业务模块，遵循技术方案 §4.1 四件套模板；
// finance_events 表归本模块（数据所有权，技术方案 §4.2）。
// Prisma 连接来自全局基础设施模块（common/prisma.module），本模块不重复提供。
// 订单域在同一事务内调用本模块公开接口写入自动事件（design/finance.md §6）。
@Module({
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
