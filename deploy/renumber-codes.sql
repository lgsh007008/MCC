-- 一次性：业务编号统一为「域前缀 + 连字符 + 5 位流水」（1-产品文档.md 五）。
-- 客户 CT-00001 / 成品销售单 SO-00001 / 财务事件 FN-00001；明细编码由接口派生，不落库。
-- 幂等：三张表都没有旧格式编号时跳过；由 deploy/deploy.sh 在备份后、停机窗口内执行。
-- 用法：psql -v ON_ERROR_STOP=1 -1 -f deploy/renumber-codes.sql（-1 = 整个文件单事务）

CREATE TEMP TABLE tmp_renumber_state AS
SELECT (
  EXISTS (SELECT 1 FROM customers WHERE code !~ '^CT-[0-9]{5,}$')
  OR EXISTS (SELECT 1 FROM sale_orders WHERE code !~ '^SO-[0-9]{5,}$')
  OR EXISTS (SELECT 1 FROM finance_events WHERE code !~ '^FN-[0-9]{5,}$')
) AS has_old;

-- 旧号 → 新号映射：按租户、创建时间顺序重排
CREATE TEMP TABLE tmp_customer_map AS
SELECT id,
       tenant_id,
       code AS old_code,
       'CT-' || lpad((row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id))::text, 5, '0') AS new_code
FROM customers;

CREATE TEMP TABLE tmp_order_map AS
SELECT id,
       tenant_id,
       code AS old_code,
       'SO-' || lpad((row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id))::text, 5, '0') AS new_code
FROM sale_orders;

CREATE TEMP TABLE tmp_event_map AS
SELECT id,
       tenant_id,
       code AS old_code,
       'FN-' || lpad((row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id))::text, 5, '0') AS new_code
FROM finance_events;

-- 第一阶段：全部改为临时号，释放旧号占位（避免两阶段之间撞唯一约束）
UPDATE customers SET code = 'TMP-' || id
WHERE (SELECT has_old FROM tmp_renumber_state);
UPDATE sale_orders SET code = 'TMP-' || id
WHERE (SELECT has_old FROM tmp_renumber_state);
UPDATE finance_events SET code = 'TMP-' || id
WHERE (SELECT has_old FROM tmp_renumber_state);

-- 第二阶段：按映射赋正式号
UPDATE customers c SET code = m.new_code
FROM tmp_customer_map m
WHERE c.id = m.id AND (SELECT has_old FROM tmp_renumber_state);
UPDATE sale_orders s SET code = m.new_code
FROM tmp_order_map m
WHERE s.id = m.id AND (SELECT has_old FROM tmp_renumber_state);
UPDATE finance_events e SET code = m.new_code
FROM tmp_event_map m
WHERE e.id = m.id AND (SELECT has_old FROM tmp_renumber_state);

-- 财务事件源单号：源单为销售单时同步新号（含已软删订单；孤儿引用保持原样并告警）
UPDATE finance_events e SET source_code = m.new_code
FROM tmp_order_map m
WHERE e.tenant_id = m.tenant_id
  AND e.source_code = m.old_code
  AND (SELECT has_old FROM tmp_renumber_state);

\echo '编号对照表（CSV）：'
\copy (SELECT 'customer' AS type, old_code, new_code FROM tmp_customer_map CROSS JOIN tmp_renumber_state s WHERE s.has_old UNION ALL SELECT 'sale_order', old_code, new_code FROM tmp_order_map CROSS JOIN tmp_renumber_state s WHERE s.has_old UNION ALL SELECT 'finance_event', old_code, new_code FROM tmp_event_map CROSS JOIN tmp_renumber_state s WHERE s.has_old ORDER BY type, old_code) TO STDOUT WITH CSV HEADER

-- 结果自检：旧格式清零；孤儿源单只告警不阻断
DO $$
DECLARE
  old_count integer;
  orphan_count integer;
BEGIN
  SELECT count(*) INTO old_count FROM (
    SELECT 1 FROM customers WHERE code !~ '^CT-[0-9]{5,}$'
    UNION ALL SELECT 1 FROM sale_orders WHERE code !~ '^SO-[0-9]{5,}$'
    UNION ALL SELECT 1 FROM finance_events WHERE code !~ '^FN-[0-9]{5,}$'
  ) leftovers;
  IF old_count > 0 THEN
    RAISE EXCEPTION '编号重排后仍有 % 条旧格式记录，已回滚', old_count;
  END IF;

  SELECT count(*) INTO orphan_count
  FROM finance_events e
  WHERE e.source_code IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM sale_orders s WHERE s.code = e.source_code);
  IF orphan_count > 0 THEN
    RAISE WARNING '有 % 条财务事件的源单号找不到对应销售单（历史数据），请人工核对', orphan_count;
  END IF;
END $$;
