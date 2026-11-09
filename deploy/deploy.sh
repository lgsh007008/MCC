#!/usr/bin/env bash
# 生产发布（技术方案 §9.5）：备份 → 拉镜像 → 迁移 → 重建应用 → 清理旧镜像。
# 用法：deploy.sh <image-tag>（由 GitHub Actions 传入 git tag）
set -euo pipefail
cd /opt/mcc
TAG="${1:?用法: deploy.sh <tag>}"
compose() { docker compose --env-file .env.prod -f docker-compose.prod.yml "$@"; }

# 记录当前版本，保证后续手动 compose 命令与本次发布一致
if grep -q '^IMAGE_TAG=' .env.prod; then
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${TAG}|" .env.prod
else
  printf 'IMAGE_TAG=%s\n' "$TAG" >> .env.prod
fi

# 先保证数据库在跑，再备份（首次部署时库是空的，备份同样无害）
compose up -d postgres redis
for _ in $(seq 1 30); do
  compose ps postgres --status healthy --quiet | grep -q . && break
  sleep 2
done
if compose ps postgres --status healthy --quiet | grep -q .; then
  ./deploy/backup.sh
else
  echo "postgres 未就绪，跳过备份" >&2
fi

compose pull
# 迁移只向前（技术方案 §9.4）；失败即中止，不进入 rebuild
compose run --rm --no-deps server pnpm --filter @mcc/db exec prisma migrate deploy
compose up -d --remove-orphans

# 清掉 7 天前的未使用镜像，避免 40G 系统盘被历史版本占满
docker image prune -af --filter "until=168h" >/dev/null
compose ps
