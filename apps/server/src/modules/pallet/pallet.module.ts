import { Module } from '@nestjs/common';
import { PalletController } from './pallet.controller.js';
import { PalletService } from './pallet.service.js';

// 业务模块，遵循技术方案 §4.1 四件套模板；
// pallet_projects / pallet_components / pallet_materials 归本模块（技术方案 §4.2）。
@Module({
  controllers: [PalletController],
  providers: [PalletService],
  exports: [PalletService],
})
export class PalletModule {}
