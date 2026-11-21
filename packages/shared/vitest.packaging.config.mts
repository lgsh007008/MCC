import { defineConfig } from 'vitest/config';

// 包装设计纯函数覆盖率门槛（技术方案 §10）：
// 覆盖几何、BOM、图纸、结论、模板解释与派生规则；与核心金额/权限门槛分开，
// 先以当前实测基线防回退，再逐步提升到 statements/functions/lines ≥95%、branches ≥90%。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage/packaging',
      include: [
        'src/design/**/*.ts',
        'src/packaging.templates.ts',
        'src/packaging.schemas.ts',
      ],
      thresholds: {
        statements: 91,
        branches: 83,
        functions: 92,
        lines: 91,
      },
    },
  },
});
