import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// 契约/集成测试：接口关键路径与契约符合性，落在 test/（*.spec.ts）。
// NestJS 依赖装饰器元数据（emitDecoratorMetadata），而 esbuild 不产出该元数据，
// 故此处与开发运行时一致走 SWC 转换（版本锁定原因见 README 已知坑）。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
  },
  plugins: [swc.vite()],
});
