import 'dotenv/config';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// 契约/集成测试：接口关键路径与契约符合性，落在 test/（*.spec.ts）。
// NestJS 依赖装饰器元数据（emitDecoratorMetadata），esbuild 不产出该元数据，
// 故此处与开发运行时一致走 SWC 转换。
// 说明：本文件用 .mts 扩展名强制 ESM 加载——CJS 加载会走 unplugin 的
// require 路径，与 vite 7 携带的纯 ESM 版 unplugin 冲突（ERR_REQUIRE_ESM）。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
  },
  plugins: [swc.vite()],
});