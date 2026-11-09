# server 生产镜像（构建上下文 = 仓库根目录）：
#   docker build -f apps/server/Dockerfile -t <registry>/<ns>/server:<tag> .
# 运行形态与本地 dev 一致：源码 + SWC loader。@mcc/shared、@mcc/db 的 exports 直指 TS 源，
# tsc 产物无法被 node 直接加载，因此运行时保留 devDependencies（技术方案 §9.5）。
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
COPY . .
# 只装 server 及其 workspace 依赖，控制镜像体积
RUN pnpm install --frozen-lockfile --filter @mcc/server...
# Prisma Client 生成产物随 node_modules 一起进入运行镜像
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
