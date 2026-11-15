-- 发布前一次性核对（迁移 20261115150000_multi_tenant 之前执行）：
-- 该迁移会给 users.tenant_id 去掉数据库默认值，并新建 tenants(id='default')。
-- 所有历史业务行必须已归属 default，否则这些数据/账号在迁移后找不到租户。
-- 只读取，不修改任何数据；本次核对完成后本文件与对应 workflow 一并删除。

\pset pager off
\echo '=== 各表 tenant_id 取值分布（应为 default 或空表）==='
DO $$
DECLARE
  r record;
  vals text;
  bad bigint;
  total_tables int := 0;
  bad_tables int := 0;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.columns
    WHERE column_name = 'tenant_id' AND table_schema = 'public'
    ORDER BY table_name
  LOOP
    total_tables := total_tables + 1;
    EXECUTE format('SELECT string_agg(DISTINCT tenant_id::text, '','') FROM %I', r.table_name) INTO vals;
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE tenant_id <> %L', r.table_name, 'default') INTO bad;
    IF bad > 0 THEN
      bad_tables := bad_tables + 1;
    END IF;
    RAISE NOTICE '% -> 取值[%]，非 default % 行',
      rpad(r.table_name, 32), coalesce(vals, '空表'), bad;
  END LOOP;
  RAISE NOTICE '--- 汇总：检查 % 张表，存在非 default 数据的表 % 张 ---', total_tables, bad_tables;
END $$;

\echo '=== 账号归属 ==='
SELECT tenant_id, role, status, COUNT(*) AS accounts FROM users GROUP BY tenant_id, role, status ORDER BY tenant_id;

\echo '=== 待迁移表是否存在（应全部为 0，说明本轮迁移尚未执行）==='
SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') AS tenants_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'plans') AS plans_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_users') AS platform_users_exists;
