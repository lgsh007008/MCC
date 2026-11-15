import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma.module.js';
import { ProductionController } from './production.controller.js';
import { ProductionService } from './production.service.js';

// 生产与库存模块（design/生产与库存.md §1）：
// 原木领用 / 方木产出 / 库存调整表归本模块；库存与成本池实时聚合，不写 order / purchase 表。
@Module({
  imports: [PrismaModule],
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
