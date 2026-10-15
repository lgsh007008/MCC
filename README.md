# 运行手册

> **定位**：本仓库的**运行手册**——只写**怎么操作**：把已有代码在任意机器上跑起来、构建、上线、排障。
> **与文档体系的关系**：`.AAAdocs` 存放结论性文档（需求 / ADR / 技术方案 / 模块设计），回答**是什么、为什么**；本手册回答**怎么做**。**不写可从代码或技术方案推导的内容**（技术栈与目录结构见 `.AAAdocs/3-技术方案.md` §2、§3；可执行命令以 `package.json` 的 scripts 为准）。
> **维护方式**：启动 / 构建 / 上线相关的内容都追加到本文件，不另开文件。

## 1. 前置要求

- Node.js >= 20、pnpm、Git（以 `package.json` 的 `engines`、`packageManager` 声明为准）。

## 2. 快速上手

```
pnpm install
pnpm db:generate
pnpm dev
```

`pnpm dev` 由 Turbo 并起各应用的开发服务；单起某应用与端口见下表。装完可自检：`pnpm typecheck`、`pnpm test`（见 §4）。

## 3. 启动与构建

| 应用 | 开发启动 | 构建 | 生产启动 | 默认地址 |
| --- | --- | --- | --- | --- |
| web | `pnpm --filter @mcc/web run dev` | `pnpm --filter @mcc/web run build` | `pnpm --filter @mcc/web run start` | http://localhost:3000 |
| server | `pnpm --filter @mcc/server run dev` | `pnpm --filter @mcc/server run build` | `pnpm --filter @mcc/server run start` | http://localhost:3001/api/v1 |
| agent | `pnpm --filter @mcc/agent run dev` | `pnpm --filter @mcc/agent run build` | `pnpm --filter @mcc/agent run start` | 当前为占位，未起服务 |

说明：server 尚无业务控制器时，访问 `/api/v1` 返回 404 属正常。

## 4. 测试

分层与工具以 `.AAAdocs/3-技术方案.md` §10 为准；本节只写用例放哪、怎么跑。

| 层次 | 用例落点 | 跑法 |
| --- | --- | --- |
| 单元 | 与源码同目录 `*.spec.ts`（例：`packages/shared/src/index.spec.ts`） | `pnpm --filter @mcc/shared run test` |
| 契约/集成 | `apps/server/test/*.spec.ts` | `pnpm --filter @mcc/server run test` |
| 全量 | 所有带 `test` 脚本的包 | `pnpm test` |

- 现无 `test` 脚本的包（web / miniapp / agent）不参与；接入时各加 `test` 脚本即可，`turbo.json` 的 `test` 任务会自动带上。
- 服务端用例经 SWC 转换（NestJS 依赖装饰器元数据），配置在 `apps/server/vitest.config.ts`；类型检查用 `apps/server/tsconfig.spec.json`（覆盖 `src` 与 `test`）。
- 当前只有脚手架自检用例（证明链路可跑），各领域真实用例随需求写入。
- 尚未接入的层次：E2E 冒烟（Playwright）与真机验收（人工），见 §9 待办。

## 5. 已知坑（换机器最容易踩）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `pnpm` 报 `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` | corepack 的 pnpm 垫片异常（垫片由 `corepack enable` 生成、位于 Node 安装目录，优先级高于全局安装） | `corepack disable pnpm` 后 `npm i -g pnpm@latest` |
| `pnpm install` 报 `ERR_PNPM_IGNORED_BUILDS` | pnpm 10+ 默认拦截依赖安装脚本 | 白名单写在 `pnpm-workspace.yaml` 的 `allowBuilds`（仓库已配好）；新依赖被拦时执行 `pnpm approve-builds --all` |
| web 构建报找不到 `@mcc/*` 的 CSS | 工作区依赖未安装 | 先 `pnpm install` |
| 服务端 `pnpm dev` 下注入型服务报依赖解析失败 | `tsx` 由 esbuild 驱动，不产出装饰器元数据（`emitDecoratorMetadata`），NestJS 拿不到构造器参数类型 | 临时：`pnpm --filter @mcc/server run build` 后 `run start`（`tsc` 会产出元数据）；根治见 §9 待办 |
| 服务端测试报 `Failed to load native binding` 或 `ERR_SWC_NATIVE_CACHE` | `@swc/core` 1.16 起校验原生绑定缓存目录的访问权限，本机 C 盘对 Everyone 授予替换权限，校验不通过 | 已锁定 `@swc/core` 精确版本 1.7.42（勿升）；换机器复现时检查环境变量 `SWC_NATIVE_BINDING_CACHE` |

## 6. 环境变量

规则（分散持有、`NEXT_PUBLIC_` 红线、仅 `.env.example` 入库）以 `.AAAdocs/3-技术方案.md` 为准；各应用变量清单见其 `.env.example`。

## 7. 数据库接入

**已完成（代码侧布局）**

- `packages/db/prisma/schema.prisma`：表结构唯一事实源；主键算法已锁定为 uuid v4，通用字段写法见该文件头部注释。
- 根脚本：`db:generate`、`db:migrate:dev`、`db:migrate:deploy`、`db:studio`。
- 连接串清单：`packages/db/.env.example`（Prisma CLI 用）、`apps/server/.env.example`（运行时用）。

**待完成（按序）**

1. 起本机实例：有 Docker 则 `docker compose up -d`（`docker-compose.yml` 已备好，含 PostgreSQL 与 Redis）；无 Docker 则本机直装 PostgreSQL 16。
2. 复制 `.env.example` 为 `.env`，填 `DATABASE_URL`（`packages/db` 与 `apps/server` 两处）。
3. 在 schema 添加首个业务模型，再 `pnpm db:migrate:dev` 生成并应用迁移（首次会自动建 `prisma/migrations/`），随后 `pnpm db:generate`。
4. 迁移纪律以 `.AAAdocs/3-技术方案.md` §5.4 为准（只向前迁移，禁止改已应用的历史迁移文件）。

Redis 暂不接入：缓存与队列属重组件，待实际需要时单独确认（见 §9 待办）。

## 8. 上线部署（待补）

> 环境分层、发布流向、密钥注入等原则见 `.AAAdocs/3-技术方案.md`；本节待实际部署时补齐可执行步骤。

## 9. 待办

- miniapp：接入 Taro 依赖与 `config/`、`src/` 骨架（当前仅占位）。
- `packages/config`：补 ESLint 预设；CI 建流水线后按 `.AAAdocs/3-技术方案.md` §10 跑门禁（lint + 类型检查 + 单测 + 契约校验）。
- 服务端 dev 运行时：换用能产出装饰器元数据的方案（当前 `tsx` 在注入型服务上会失败，见 §5）。
- 数据库：起本机实例、写首个业务模型、跑首次迁移（见 §7）；Redis 按需接入。
- E2E 冒烟：staging 建立后接入 Playwright；真机验收为人工（体验版）。
- 覆盖率硬门槛：首个核心计算模块落地时启用（技术方案 §10）。
- 上线部署（见 §8）：待实际部署时补齐。

## Changelog

### v20261015

| 位置 | 类型 | 原本 | 现在 | 原因 |
| --- | --- | --- | --- | --- |
| 全文 | 新增 | — | 建立运行手册：环境要求、仓库结构、首次安装实录、常用命令、启动、构建、环境变量、数据库接入与上线待补、排障、待办 | 安装过程与运维步骤需有唯一落点，便于后续追加 |
| 全文 | 修改 | 面向单台机器的实录：环境要求含本机现状列、仓库结构、网络与代理处理小节、安装实测数字（227 包 / 5-5 / 3-3）、启动冒烟结论 | 改为新机器可照做的通用安装指导：环境要求只留要求、去掉仓库结构与网络小节、去掉实测数字；保留 corepack 垫片与安装脚本白名单两条通用坑；版本口径改引 lockfile 与技术方案 §2 | 手册须面向任意机器复用，不绑定单台机器的环境与网络细节 |
| 全文 | 修改 | 逐步安装教程（装 pnpm、装依赖、生成 Client、校验四小节）、版本口径小节、常用命令长表 | 收成极简快速上手（install / db:generate / dev 三步）与启动构建表；环境变量、迁移纪律、技术栈与目录结构一律改为指向 `.AAAdocs` 与技术方案的指针；仅保留两条不可推导的已知坑 | 安装步骤与命令可由技术方案与仓库配置推导，写在手册属重复；经验坑是唯一无法推导且有价值的信息 |
| 新增 §4 测试 | 新增 | — | 测试章节：单元与契约集成两层的用例落点与跑法、全量命令、SWC 转换与类型检查配置、尚未接入的层次 | 测试链路落地，需给出操作落点 |
| 章节编号与正文引用 | 修改 | 原 §4 已知坑、§5 环境变量、§6 数据库接入、§7 上线部署、§8 待办 | 顺次下移为 §5~§9；正文与待办内的章节引用同步更新 | 测试章节需插在启动与构建之后 |
| §2 快速上手 | 修改 | 三步（install / db:generate / dev） | 增补一行自检命令（`pnpm typecheck`、`pnpm test`） | 新增测试链路后需给出自检入口 |
| §5 已知坑 | 新增 | 三条（corepack 垫片、安装脚本白名单、工作区依赖） | 增补两条：`tsx` 不产出装饰器元数据致注入失败、`@swc/core` 1.16 缓存校验不通过 | 均为实测确认且无法从代码推导的排障知识 |
| §7 数据库接入 | 修改 | 标题为数据库接入（待完成），列 4 步接入步骤、声明当前未接入数据库 | 改为「已完成（代码侧布局）」与「待完成（实例、首个业务模型、首次迁移）」两段，并说明 Redis 暂不接入 | 代码侧布局已完成，手册需反映实际进度 |
| §9 待办 | 修改 | 三条（miniapp 占位、ESLint 预设与 CI 边界规则、数据库接入与上线部署） | 拆细并增补：CI 门禁、服务端 dev 运行时、数据库实例与迁移、E2E 接入、覆盖率门槛 | 本轮落地后暴露的后续项需有落点 |
| 依赖白名单 | 修改 | `pnpm-workspace.yaml` 的 `allowBuilds` 仅含 prisma 与 esbuild | 增补 `@swc/core` | 服务端测试引入 SWC，其安装脚本被 pnpm 10+ 拦截 |
