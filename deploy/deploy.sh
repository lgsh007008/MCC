#!/usr/bin/env bash
# 生产发布（技术方案 §9.5）：备份 → 拉镜像 → 迁移 → 重建应用 → 清理旧镜像。
# 用法：deploy.sh <image-tag>（由 GitHub Actions 传入 git tag）
set -euo pipefail
cd /opt/mcc
TAG="${1:?用法: deploy.sh <tag>}"
compose() { docker compose --env-file .env.prod -f docker-compose.prod.yml "$@"; }

# 分阶段计时（排查发布耗时）：写入 deploy/last-deploy.log，便于事后定位瓶颈
T0=$(date +%s)
mark() { printf '[deploy %s] %s 累计=%ss\n' "$(date +%H:%M:%S)" "$1" "$(( $(date +%s) - T0 ))" | tee -a deploy/last-deploy.log; }
: > deploy/last-deploy.log
mark "开始（tag=$TAG）"

# 记录当前版本，保证后续手动 compose 命令与本次发布一致
if grep -q '^IMAGE_TAG=' .env.prod; then
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${TAG}|" .env.prod
else
  printf 'IMAGE_TAG=%s\n' "$TAG" >> .env.prod
fi

# 先保证数据库在跑，再备份（首次部署时库是空的，备份同样无害）。
# 注意：compose ps 的 --status 不接受 healthy（返回空导致误判），健康状态须用 inspect 读。
compose up -d postgres redis
pg_ready() {
  local cid
  cid="$(compose ps -q postgres)"
  [ -n "$cid" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)" = "healthy" ]
}
for _ in $(seq 1 30); do
  pg_ready && break
  sleep 2
done
if pg_ready; then
  ./deploy/backup.sh
  mark "备份完成"
else
  # 发布前备份是硬步骤（技术方案 §9.5）：数据库不就绪则中止，不带病发布
  echo "postgres 未就绪，中止发布" >&2
  exit 1
fi

compose pull
mark "镜像拉取完成"
# 迁移只向前（技术方案 §9.4）；失败即中止，不进入 rebuild
compose run --rm --no-deps server pnpm --filter @mcc/db exec prisma migrate deploy
mark "迁移完成"
compose up -d --remove-orphans
mark "容器重建完成"

# 清掉 7 天前的未使用镜像，避免 40G 系统盘被历史版本占满
docker image prune -af --filter "until=168h" >/dev/null
compose ps
