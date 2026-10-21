// 开发运行时自定义 ESM loader（配合 SWC）。背景与方案见 apps/server/package.json dev 脚本：
// 1. server 以纯 ESM 运行（@nestjs/core 12 仅 ESM 入口）；
// 2. 源码为 TypeScript + 相对导入带 .js 后缀（NodeNext 纪律），由本 loader 映射回 .ts；
// 3. workspace 包（@mcc/shared、@mcc/db）的 exports 直接指向 .ts 源文件，一律由 SWC 编译；
// 4. 转译用 @swc-node/register 的 compile（按 apps/server/tsconfig.json 产出装饰器元数据），
//    这是 NestJS 依赖注入与 @nestjs/swagger 契约生成的前提。
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
// 直接按物理路径引入（包 exports 的 ./register 子路径仅开放 require 条件，ESM import 会被拒绝）
import { compile } from './node_modules/@swc-node/register/lib/register.js';
import { readDefaultTsConfig } from './node_modules/@swc-node/register/lib/read-default-tsconfig.js';

const tsconfig = readDefaultTsConfig();
tsconfig.module = ts.ModuleKind.ESNext;
const tsconfigForSwc = { ...tsconfig, paths: undefined, baseUrl: undefined };

function resolveRelativeTs(specifier, parentURL) {
  if (!specifier.startsWith('.')) {
    return null;
  }
  const path = fileURLToPath(new URL(specifier, parentURL));
  // 统一按「先试同名 .ts、再试目录 index.ts」探测；不做扩展名推断
  // （文件名可含点，如 auth.schemas.ts，正则推断会误判）。
  const candidates = path.endsWith('.js')
    ? [`${path.slice(0, -3)}.ts`]
    : [`${path}.ts`, `${path}/index.ts`];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

export const resolve = async (specifier, context, nextResolve) => {
  const tsUrl = resolveRelativeTs(specifier, context.parentURL);
  // 入口文件（node 直接加载的 src/main.ts）
  if (!context.parentURL) {
    return {
      url: specifier,
      shortCircuit: true,
      importAttributes: { ...context.importAttributes, swc: 'entrypoint' },
    };
  }
  if (tsUrl) {
    return {
      url: tsUrl,
      shortCircuit: true,
      importAttributes: { ...context.importAttributes, swc: tsUrl },
    };
  }
  const result = await nextResolve(specifier, context);
  // 默认解析落到 .ts（裸包 exports 直指 TS 源）时同样接管编译
  if (result && typeof result.url === 'string' && result.url.endsWith('.ts')) {
    return {
      ...result,
      shortCircuit: true,
      importAttributes: { ...context.importAttributes, swc: result.url },
    };
  }
  return result;
};

export const load = async (url, context, nextLoad) => {
  if (context.importAttributes.swc) {
    delete context.importAttributes.swc;
    const { source } = await nextLoad(url, { ...context, format: 'ts' });
    const code = !source || typeof source === 'string' ? source : Buffer.from(source).toString();
    const compiled = await compile(code, fileURLToPath(url), tsconfigForSwc, true);
    return { format: 'module', source: compiled, shortCircuit: true };
  }
  return nextLoad(url, context);
};