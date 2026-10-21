import { defineConfig } from '@playwright/test';

// E2E 冒烟（技术方案 §10）：核心链路端到端，跑在真实浏览器上。
// 本地：先起 dev（web 于 3000），server 由本配置代为拉起（复用已在跑的实例）；
// staging 落地后按 §10 把本套用例接入 CI 对 staging 执行。
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    // 直接起 server 单进程（dev watch 模式在无 TTY 环境不稳）；已运行的实例则复用
    command: 'node --loader ./loader.mjs src/main.ts',
    cwd: '../server',
    url: 'http://localhost:3001/api/docs',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});