import { Module } from '@nestjs/common';
import { PackagingController } from './packaging.controller.js';
import { PackagingService } from './packaging.service.js';

// 业务模块，遵循技术方案 §4.1 四件套模板；
// packaging_projects / units / parts / templates / materials / revisions 归本模块（技术方案 §4.2）。
@Module({
  controllers: [PackagingController],
  providers: [PackagingService],
  exports: [PackagingService],
})
export class PackagingModule {}
