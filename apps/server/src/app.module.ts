import { Module } from '@nestjs/common';

// 模块化单体的根模块。业务模块按领域在 src/modules/<domain>/ 下新增，
// 每个模块自带 Controller / Service / 表，并只通过 index.ts 对外暴露（技术方案 §4）。
@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
