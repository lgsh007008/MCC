import { defineConfig } from 'vitest/config';

// 单元测试：纯函数与校验规则，与源码同目录（*.spec.ts）。
// 分层与落点约定见技术方案 §10。
// 说明：本文件用 .mts 扩展名强制 ESM 加载（CJS 加载与 vite 7 的纯 ESM 版本冲突，ERR_REQUIRE_ESM）。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});