# server 生产镜像（构建上下文 = 仓库根目录）：
#   docker build -f apps/server/Dockerfile -t <registry>/<ns>/server:<tag> .
# 运行形态与本地 dev 一致：源码 + SWC loader。@mcc/shared、@mcc/db 的 exports 直指 TS 源，
# tsc 产物无法被 node 直接加载，因此运行时保留 devDependencies（技术方案 §9.5）。
# 层序：先只拷 manifest 装依赖（依赖层只随 lockfile 变化），再拷源码——发布时只需传输变更的小层。
FROM node:20-bookworm-slim AS build
# Prisma 依赖 openssl 探测引擎版本：未装 openssl 时会误生成 openssl-1.1.x 引擎，
# 在 Debian 12（OpenSSL 3）运行时加载失败。
# 国内服务器直连 deb.debian.org 会长时间卡住；slim 镜像无 CA 证书，https 源会 TLS 校验失败，
# 因此统一用阿里云 http 镜像源（原 debian.sources 本身即 http）。
RUN sed -i 's|http://deb.debian.org|http://mirrors.aliyun.com|g; s|http://security.debian.org|http://mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
 && export DEBIAN_FRONTEND=noninteractive \
 && apt-get update -o Acquire::Retries=3 \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.11.2 --no-fund --no-audit
WORKDIR /app

# 1) 依赖层：只依赖 lockfile 与各 workspace 的 package.json
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc turbo.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/agent/package.json ./apps/agent/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tokens/package.json ./packages/tokens/
RUN pnpm install --frozen-lockfile --filter @mcc/server...

# 2) 源码层：Prisma Client 生成产物随 node_modules 一起进入运行镜像
COPY . .
RUN pnpm --filter @mcc/db run generate

FROM node:20-bookworm-slim AS runtime
RUN sed -i 's|http://deb.debian.org|http://mirrors.aliyun.com|g; s|http://security.debian.org|http://mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
 && export DEBIAN_FRONTEND=noninteractive \
 && apt-get update -o Acquire::Retries=3 \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.11.2 --no-fund --no-audit
WORKDIR /app
COPY --from=build /app ./
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app/apps/server
EXPOSE 3001
CMD ["node", "--loader", "./loader.mjs", "src/main.ts"]
