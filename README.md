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