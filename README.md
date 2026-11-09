# MCC

## 环境要求

| 工具 | 版本 |
| --- | --- |
| Node.js | >= 20 |
| pnpm | 12.11.2（根 package.json 已声明，corepack 启用后自动切换） |
| Docker Desktop | 需要（本地 PostgreSQL 16 + Redis 7 跑在容器里） |

## 快速开始

1. 安装依赖：

```
pnpm install
```

2. 启动数据库与 Redis（首次会拉取镜像）：

```
docker compose up -d
```

3. 初始化环境变量（PowerShell，复制后即可用，默认值已适配本地）：

```
Copy-Item apps\web\.env.example apps\web\.env.local
Copy-Item apps\server\.env.example apps\server\.env
Copy-Item apps\agent\.env.example apps\agent\.env
```

4. 启动：

```
pnpm dev
```

5. 访问：

| 入口 | 地址 |
| --- | --- |
| 对客端 | http://localhost:3000 |
| 管理后台 | http://localhost:3000/admin |
| 后端 API | http://localhost:3001/api/v1 |

## 日常启动（以后每次开发）

1. 打开 Docker Desktop，等状态变为 Engine running（设置里可勾选开机自启，省掉这步）；

2. 启动数据库（容器常驻，镜像已下载过会很快）：

```
cd d:\0000MCC
docker compose up -d
```

3. 启动开发服务：

```
pnpm dev
```

浏览器访问 http://localhost:3000（管理后台 http://localhost:3000/admin）。

> `pnpm install` 与复制 `.env` 只在初次 / 新机器上需要，日常启动不用。停止开发服务按 `Ctrl+C`；停数据库用 `docker compose down`（一般不用停）。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| pnpm dev | 启动 web / server / agent 开发服务 |
| pnpm build | 构建全部应用 |
| pnpm lint | 代码检查 |
| pnpm typecheck | 类型检查 |
| pnpm test | 运行测试 |
| pnpm format | 代码格式化 |

## 国内网络：Docker 镜像加速

国内直连 Docker Hub 常超时（报 registry-1.docker.io 拉取失败），导致快速开始第 2 步卡住。遇到时：

1. 在本机 %USERPROFILE%\.docker\daemon.json 里给 registry-mirrors 数组填入以下可用地址（可配多个）：
   - https://docker.1panel.live
   - https://dockerproxy.net
   - https://docker.1ms.run

2. 重启 Docker Desktop；

3. 重新执行 `docker compose up -d`。

## 已知坑（Windows 开发环境，改配置前先看这里）

1. **server 的 dev 运行方式**：`apps/server` 是纯 ESM 项目（NestJS 12 仅 ESM 入口），dev 脚本用 `node --watch --loader ./loader.mjs`（自定义 loader：相对导入 .js↔.ts 映射 + workspace 包 TS 源编译 + SWC 产出装饰器元数据）。**不要改回 tsx**——tsx/esbuild 不产装饰器元数据，NestJS 依赖注入会静默失效（注入值为 undefined）。

2. **@swc/core 版本锁定 1.7.42**：更新版（≥1.13）加载原生绑定时会做缓存目录安全检查，本机用户目录 ACL 不满足（报 ERR_SWC_NATIVE_CACHE），故锁定旧版，并由 `pnpm-workspace.yaml` 的 overrides 把 `@swc-node/core` 固定在兼容的 1.13.1。升级前先在目标机器验证 `node -e "require('@swc/core').version"`。

3. **vitest 配置必须用 .mts 扩展名**：vite 7 为纯 ESM，CJS 方式加载配置文件会报 ERR_REQUIRE_ESM（server 与 shared 均已处理）。

4. **安装新依赖后**：若有依赖带安装脚本被 pnpm 拦截（ERR_PNPM_IGNORED_BUILDS），按需在 `pnpm-workspace.yaml` 的 `allowBuilds` 里放行。

## 契约再生成（接口变更后必做）

接口定义只写在后端代码里，契约由装饰器生成（ADR-006，禁止手写接口文档）。改了任一接口后执行：

```
pnpm --filter @mcc/server run gen:openapi   # 后端装饰器 → packages/shared/openapi.json
pnpm --filter @mcc/shared run gen:client    # openapi.json → 类型化 client 类型
```

前端 web 直接消费 `@mcc/shared` 的类型化 client，接口改动时前端编译即报错。

## 测试（分层与落点见技术方案 §10）

| 命令 | 层次 | 说明 |
| --- | --- | --- |
| `pnpm lint` | 静态门禁 | 全仓 eslint，含模块边界规则（§4.2：跨模块只许走 index） |
| `pnpm test` | 单测/契约集成 | server（auth 关键路径，需 PG/Redis 容器在跑）、shared |
| `pnpm --filter @mcc/web run test:e2e` | E2E 冒烟 | Playwright 登录→工作台→登出→守卫全链路；web dev（3000）需在跑，server 由配置代起；staging 落地后按 §10 接入 CI |