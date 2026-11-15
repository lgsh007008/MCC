import { Module } from '@nestjs/common';
import { CustomerModule } from '../customer/index.js';
import { FinanceModule } from '../finance/index.js';
import { ProductionModule } from '../production/index.js';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';

// 业务模块，遵循技术方案 §4.1 四件套模板；
// sale_order / sale_order_item 表归本模块（数据所有权，技术方案 §4.2）。
// 客户校验经 customer 模块的公开接口（index.ts），不读 customer 表。
// 财务联动经 finance 模块公开接口（同事务写入自动事件，design/finance.md §6）。
// 材料成本快照经 production 公开方法取当前方木平均成本（design/order.md §2 / design/生产与库存.md §6）；
// production 只读聚合 order 表，不导入 OrderModule，避免模块环。
// Prisma/Redis 连接来自全局基础设施模块（common/prisma.module、common/redis.module），本模块不重复提供。
@Module({
  imports: [CustomerModule, FinanceModule, ProductionModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}