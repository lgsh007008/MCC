import { defineConfig } from '@playwright/test';

// E2E 冒烟（技术方案 §10）：核心链路端到端，跑在真实浏览器上。
// web 与 server 均由本配置在本机拉起（已在运行的实例则复用）：
// 本地 web 用 dev（3000，复用日常开发实例）；CI 用构建产物 next start（3000，产物由 CI 构建步骤产出）；
// server 一律直跑源文件单进程（dev watch 模式在无 TTY 环境不稳）。
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  // 串行执行：本地 web 用 next dev，按需编译；并行用例会互相拖慢首屏 hydration，
  // 出现点击先于事件绑定导致的不稳定（用例仅数条，串行成本可忽略）
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node --loader ./loader.mjs src/main.ts',
      cwd: '../server',
      url: 'http://localhost:3001/api/docs',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: isCI ? 'pnpm next start -p 3000' : 'pnpm next dev -p 3000',
      url: 'http://localhost:3000/login',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});