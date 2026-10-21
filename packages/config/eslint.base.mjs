import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// 全仓共享的 ESLint flat 基础预设（技术方案 §10：CI 门禁 lint + 类型检查 + 单测）。
// 各包的 eslint.config.mjs 引用本工厂；server 另叠加边界规则（@see eslint.server.mjs）。
export function baseConfig({ browser = false, ignores = [] } = {}) {
  return tseslint.config(
    {
      ignores: [
        '**/dist/**',
        '**/node_modules/**',
        '**/.next/**',
        '**/.turbo/**',
        '**/src/gen/**',
        ...ignores,
      ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts', '**/*.mjs'],
      languageOptions: {
        globals: browser ? globals.browser : globals.node,
      },
    },
    {
      // 未使用变量：_ 前缀的参数/变量视为有意忽略（如 zod 校验管道里的占位 body）
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    },
    prettier,
  );
}