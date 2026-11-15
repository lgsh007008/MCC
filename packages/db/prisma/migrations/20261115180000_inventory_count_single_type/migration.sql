-- 盘点单改为「一张单只盘一类库存」+ 原因枚举调整（product/生产与库存.md R-生产-003）
-- 线上无历史数据：旧混合盘点测试数据直接删除，不做兼容迁移。

DELETE FROM "inventory_adjustment_items"
WHERE "adjustment_id" IN (
  SELECT "id" FROM "inventory_adjustments" WHERE "type" = 'COUNT'
);

DELETE FROM "inventory_adjustments" WHERE "type" = 'COUNT';

CREATE TYPE "inventory_adjustment_reason_new" AS ENUM ('OPENING', 'MEASUREMENT', 'MISSING', 'DAMAGE', 'OTHER');

ALTER TABLE "inventory_adjustment_items"
  ALTER COLUMN "reason" TYPE "inventory_adjustment_reason_new"
  USING (
    CASE "reason"::text
      WHEN 'COUNT_GAIN' THEN 'OTHER'
      WHEN 'COUNT_LOSS' THEN 'OTHER'
      ELSE "reason"::text
    END
  )::"inventory_adjustment_reason_new";

DROP TYPE "inventory_adjustment_reason";

ALTER TYPE "inventory_adjustment_reason_new" RENAME TO "inventory_adjustment_reason";
