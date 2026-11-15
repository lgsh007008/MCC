-- 标准版套餐主键改为合法 UUID（zod .uuid() 校验要求 RFC 4122 版本/变体位）。
-- 原值 00000000-0000-0000-0000-000000000001 版本位为 0，前端/服务端 schema 会拒绝，
-- 导致「新建租户」「改套餐」等按套餐 id 校验的接口 400。
-- 外键为立即校验且 name 唯一：先复制新主键行（临时腾出名称），再迁移引用方，最后删旧行。

DO $$
DECLARE
  v_created timestamptz(3);
  v_updated timestamptz(3);
  v_name    text;
  v_max     integer;
  v_status  plan_status;
  v_note    text;
BEGIN
  SELECT created_at, updated_at, name, max_accounts, status, note
    INTO v_created, v_updated, v_name, v_max, v_status, v_note
  FROM plans
  WHERE id = '00000000-0000-0000-0000-000000000001';

  IF v_name IS NULL THEN
    RETURN;
  END IF;

  UPDATE plans
  SET name = v_name || '（迁移临时）'
  WHERE id = '00000000-0000-0000-0000-000000000001';

  INSERT INTO plans (id, created_at, updated_at, name, max_accounts, status, note)
  VALUES (
    '00000000-0000-4000-8000-000000000001',
    v_created,
    v_updated,
    v_name,
    v_max,
    v_status,
    v_note
  );
END $$;

UPDATE plan_features
SET plan_id = '00000000-0000-4000-8000-000000000001'
WHERE plan_id = '00000000-0000-0000-0000-000000000001';

UPDATE tenants
SET plan_id = '00000000-0000-4000-8000-000000000001'
WHERE plan_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM plans
WHERE id = '00000000-0000-0000-0000-000000000001';
