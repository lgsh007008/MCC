import { defineConfig } from 'vitest/config';

// 单元测试：纯函数与校验规则，与源码同目录（*.spec.ts）。
// 分层与落点约定见技术方案 §10。
// 说明：本文件用 .mts 扩展名强制 ESM 加载（CJS 加载与 vite 7 的纯 ESM 版本冲突，ERR_REQUIRE_ESM）。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // 核心计算纯函数设硬门槛（技术方案 §10）：这些文件是全系统金额/方量口径的唯一实现，
    // 不追求全包覆盖率，只锁计算与权限判定，避免门禁被大量非计算代码稀释。
    coverage: {
      provider: 'v8',
      include: [
        'src/order.calc.ts',
        'src/purchase.calc.ts',
        'src/finance.calc.ts',
        'src/money.ts',
        'src/auth.permissions.ts',
      ],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});