import { mccBoundariesPlugin } from './eslint.rules/mcc-boundaries.mjs';
import { baseConfig } from './eslint.base.mjs';

// server 专项预设：模块边界强制（技术方案 §4.2 硬规则 + ADR-001「边界纪律由 lint 在 CI 中强制」）。
// 边界规则为本仓库自行实现的等价方案（eslint.rules/mcc-boundaries.mjs）：
// 按文件路径判定，不依赖第三方解析链（eslint-plugin-boundaries 在 eslint 10 + pnpm 布局下解析不可靠）。
// 语义：src/modules/<domain> 之间只许经对方 index（唯一公开出口）引用；模块内部文件互引不受限；
// 测试（test/**）可直达模块内部以便断点级验证。
export function serverConfig() {
  return [
    ...baseConfig(),
    {
      plugins: { 'mcc-boundaries': mccBoundariesPlugin },
      rules: {
        'mcc-boundaries/no-module-internals': 'error',
      },
    },
  ];
}