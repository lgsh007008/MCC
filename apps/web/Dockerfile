# web 生产镜像（构建上下文 = 仓库根目录）：
#   docker build -f apps/web/Dockerfile --build-arg API_INTERNAL_URL=http://server:3001 .
# Next rewrites 在构建期固化，API_INTERNAL_URL 指向容器网络内的 server（技术方案 §9.5）。
FROM node:20-bookworm-slim AS build
RUN npm install -g pnpm@12.11.2 --no-fund --no-audit
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @mcc/web...
ARG API_INTERNAL_URL=http://server:3001
ENV API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @mcc/web run build

FROM node:20-bookworm-slim AS runtime
RUN npm install -g pnpm@12.11.2 --no-fund --no-audit
WORKDIR /app
COPY --from=build /app ./
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    API_INTERNAL_URL=http://server:3001
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
