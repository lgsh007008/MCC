import { defineConfig } from 'vitest/config';

// 单元测试：纯函数（如多标签页状态机），与源码同目录（*.spec.ts）。
// 分层与落点约定见技术方案 §10；.mts 强制 ESM 加载（vite 7 纯 ESM，CJS 会 ERR_REQUIRE_ESM）。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.spec.ts'],
  },
});
