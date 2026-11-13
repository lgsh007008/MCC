import { Module } from '@nestjs/common';
import { CustomerModule } from '../customer/index.js';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';

// 业务模块，遵循技术方案 §4.1 四件套模板；
// finance_accounts / finance_cash_entries 表归本模块
// （数据所有权，技术方案 §4.2）。Prisma 连接来自全局基础设施模块（common/prisma.module）。
// 订单域在同一事务内调用本模块公开接口派生现结收款流水（design/finance.md §6）。
// 资金收款的客户校验与名称快照经 customer 模块公开接口。
@Module({
  imports: [CustomerModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
