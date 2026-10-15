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

`pnpm dev` 由 Turbo 并起各应用的开发服务；单起某应用与端口见下表。

## 3. 启动与构建

| 应用 | 开发启动 | 构建 | 生产启动 | 默认地址 |
| --- | --- | --- | --- | --- |
| web | `pnpm --filter @mcc/web run dev` | `pnpm --filter @mcc/web run build` | `pnpm --filter @mcc/web run start` | http://localhost:3000 |
| server | `pnpm --filter @mcc/server run dev` | `pnpm --filter @mcc/server run build` | `pnpm --filter @mcc/server run start` | http://localhost:3001/api/v1 |
| agent | `pnpm --filter @mcc/agent run dev` | `pnpm --filter @mcc/agent run build` | `pnpm --filter @mcc/agent run start` | 当前为占位，未起服务 |

说明：server 尚无业务控制器时，访问 `/api/v1` 返回 404 属正常。

## 4. 已知坑（换机器最容易踩）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `pnpm` 报 `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` | corepack 的 pnpm 垫片异常（垫片由 `corepack enable` 生成、位于 Node 安装目录，优先级高于全局安装） | `corepack disable pnpm` 后 `npm i -g pnpm@latest` |
| `pnpm install` 报 `ERR_PNPM_IGNORED_BUILDS` | pnpm 10+ 默认拦截依赖安装脚本 | 白名单写在 `pnpm-workspace.yaml` 的 `allowBuilds`（仓库已配好）；新依赖被拦时执行 `pnpm approve-builds --all` |
| web 构建报找不到 `@mcc/*` 的 CSS | 工作区依赖未安装 | 先 `pnpm install` |

## 5. 环境变量

规则（分散持有、`NEXT_PUBLIC_` 红线、仅 `.env.example` 入库）以 `.AAAdocs/3-技术方案.md` 为准；各应用变量清单见其 `.env.example`。

## 6. 数据库接入（待完成）

当前未接入数据库，代码骨架不依赖它即可运行。接入步骤：

1. 准备本地 PostgreSQL 与 Redis：有 Docker 则 `docker compose up -d`（`docker-compose.yml` 已备好）；无 Docker 则本机直装。
2. 在 `apps/server/.env` 与 `packages/db/.env` 填好 `DATABASE_URL`、`REDIS_URL`。
3. 在 `packages/db/prisma/schema.prisma` 添加首个业务模型。
4. `pnpm db:migrate:dev` 生成并应用迁移，再 `pnpm db:generate`。

迁移纪律以 `.AAAdocs/3-技术方案.md` 为准。

## 7. 上线部署（待补）

> 环境分层、发布流向、密钥注入等原则见 `.AAAdocs/3-技术方案.md`；本节待实际部署时补齐可执行步骤。

## 8. 待办

- miniapp：接入 Taro 依赖与 `config/`、`src/` 骨架（当前仅占位）。
- `packages/config`：补 ESLint 预设并在 CI 中启用边界规则。
- 数据库接入（见 6）与上线部署（见 7）。

## Changelog

### v20261015

| 位置 | 类型 | 原本 | 现在 | 原因 |
| --- | --- | --- | --- | --- |
| 全文 | 新增 | — | 建立运行手册：环境要求、仓库结构、首次安装实录、常用命令、启动、构建、环境变量、数据库接入与上线待补、排障、待办 | 安装过程与运维步骤需有唯一落点，便于后续追加 |
| 全文 | 修改 | 面向单台机器的实录：环境要求含本机现状列、仓库结构、网络与代理处理小节、安装实测数字（227 包 / 5-5 / 3-3）、启动冒烟结论 | 改为新机器可照做的通用安装指导：环境要求只留要求、去掉仓库结构与网络小节、去掉实测数字；保留 corepack 垫片与安装脚本白名单两条通用坑；版本口径改引 lockfile 与技术方案 §2 | 手册须面向任意机器复用，不绑定单台机器的环境与网络细节 |
| 全文 | 修改 | 逐步安装教程（装 pnpm、装依赖、生成 Client、校验四小节）、版本口径小节、常用命令长表 | 收成极简快速上手（install / db:generate / dev 三步）与启动构建表；环境变量、迁移纪律、技术栈与目录结构一律改为指向 `.AAAdocs` 与技术方案的指针；仅保留两条不可推导的已知坑 | 安装步骤与命令可由技术方案与仓库配置推导，写在手册属重复；经验坑是唯一无法推导且有价值的信息 |
