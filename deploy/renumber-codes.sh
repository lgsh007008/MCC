#!/usr/bin/env bash
# 一次性编号重排（幂等，1-产品文档.md 五）：备份后、停机窗口内执行。
# 无旧格式时 SQL 内直接跳过；输出与旧→新对照表落 /opt/mcc/deploy/renumber-<时间>.log。
set -euo pipefail
cd /opt/mcc

compose() { docker compose --env-file .env.prod -f docker-compose.prod.yml "$@"; }

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="deploy/renumber-${STAMP}.log"

compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f -' \
  < deploy/renumber-codes.sql | tee "$OUT"

echo "编号重排输出已保存：/opt/mcc/${OUT}"
