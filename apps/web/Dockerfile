# web 生产镜像（构建上下文 = 仓库根目录）：
#   docker build -f apps/web/Dockerfile --build-arg API_INTERNAL_URL=http://server:3001 .
# Next rewrites 在构建期固化，API_INTERNAL_URL 指向容器网络内的 server（技术方案 §9.5）。
# Next 以 standalone 产物运行：镜像只带 .next/standalone + static，体积远小于整仓 + node_modules。
FROM node:20-bookworm-slim AS build
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
RUN pnpm install --frozen-lockfile --filter @mcc/web...

# 2) 源码层
COPY . .
ARG API_INTERNAL_URL=http://server:3001
ENV API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @mcc/web run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
# standalone 根含 node_modules 与 apps/web/server.js；静态资源需另行拷入
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
