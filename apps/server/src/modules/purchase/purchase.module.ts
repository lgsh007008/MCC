import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/index.js';
import { SupplierModule } from '../supplier/index.js';
import { PurchaseController } from './purchase.controller.js';
import { PurchaseService } from './purchase.service.js';

// 业务模块，遵循技术方案 §4.1 四件套模板；
// purchase_orders 表归本模块（数据所有权，技术方案 §4.2）。
// 供应商校验经 supplier 公开接口；现结派生付款流水经 finance 公开接口，不写财务表。
@Module({
  imports: [SupplierModule, FinanceModule],
  controllers: [PurchaseController],
  providers: [PurchaseService],
  exports: [PurchaseService],
})
export class PurchaseModule {}
