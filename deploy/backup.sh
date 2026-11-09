#!/usr/bin/env bash
# 数据库备份（技术方案 §9.5）：pg_dump 压缩落盘，本机保留 14 天。
# 由 deploy.sh 在每次发布前调用，并由服务器 cron 每日执行。
set -euo pipefail
cd /opt/mcc
mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "backups/mcc-${STAMP}.sql.gz"
find backups -name 'mcc-*.sql.gz' -mtime +14 -delete
