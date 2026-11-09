import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller.js';
import { CustomerService } from './customer.service.js';

// 业务模块，遵循技术方案 §4.1 四件套模板；
// customer 表归本模块（数据所有权，技术方案 §4.2）。
// Prisma 连接来自全局基础设施模块（common/prisma.module），本模块不重复提供。
@Module({
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
