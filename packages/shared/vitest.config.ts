import { defineConfig } from 'vitest/config';

// 单元测试：纯函数与校验规则，与源码同目录（*.spec.ts）。
// 分层与落点约定见技术方案 §10。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
