import { existsSync } from 'node:fs';
import path from 'node:path';

// 模块边界规则（技术方案 §4.2 的等价实现，替代 eslint-plugin-boundaries）：
// 该插件在 eslint 10 + pnpm 布局下依赖解析链不可靠，故按「文件路径」直接判定——
// * 相对导入的目标落在 src/modules/<domain>/ 下时，
//   - 跨模块（目标 domain ≠ 来源 domain）只许指向对方的 index（唯一公开出口）；
//   - 其余一律算直达内部实现/表，报错拦截（ADR-001 要求 CI 强制的边界纪律）。
// * tests 来源不做限制（测试需断点级访问内部）。
// 不依赖任何模块解析器：.js 后缀按 NodeNext 约定映射 .ts，无后缀补 .ts 或 /index.ts。

const MODULES_RE = /[/\\]src[/\\]modules[/\\]([^/\\]+)[/\\]/;

function resolveTsCandidate(fromFile, source) {
  let target = path.resolve(path.dirname(fromFile), source);
  if (target.endsWith('.js')) {
    target = `${target.slice(0, -3)}.ts`;
  } else if (!/\.\w+$/.test(target)) {
    if (existsSync(`${target}.ts`)) {
      target = `${target}.ts`;
    } else {
      target = path.join(target, 'index.ts');
    }
  }
  return target;
}

function moduleOf(filePath) {
  const match = MODULES_RE.exec(filePath);
  return match ? match[1] : null;
}

export const noModuleInternals = {
  meta: {
    type: 'problem',
    messages: {
      forbidden:
        '模块边界（技术方案 §4.2）：只许经公开出口（index）引用其他模块，禁止直接读对方内部实现或表',
    },
    schema: [],
  },
  create(context) {
    const fromFile = context.filename ?? context.getFilename();

    return {
      ImportDeclaration(node) {
        const source = String(node.source.value ?? '');
        if (!source.startsWith('.')) {
          return;
        }
        // 测试允许直达模块任意文件（含内部实现），以便断点级验证
        if (fromFile.replaceAll('\\', '/').includes('/test/')) {
          return;
        }
        const target = resolveTsCandidate(fromFile, source);
        const targetModule = moduleOf(target);
        if (!targetModule) {
          return; // 目标是模块外的文件（common/root 等），本规则只守模块边界
        }
        const fromModule = moduleOf(fromFile);
        // 跨模块访问（含 common 等模块外来源）：目标必须是对方的 index
        if (fromModule !== targetModule && path.basename(target) !== 'index.ts') {
          context.report({ node, messageId: 'forbidden' });
        }
      },
    };
  },
};

export const mccBoundariesPlugin = {
  rules: { 'no-module-internals': noModuleInternals },
};