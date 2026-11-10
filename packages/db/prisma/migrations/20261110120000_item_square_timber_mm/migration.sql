-- v20261110：产品类型单值化为「方木」；尺寸 cm → 整数 mm；新增行级计价方式。
-- 破坏性、已授权：正式库无订单数据；测试库删除「其他」明细及因此变空的主单。

-- 1) 新枚举
CREATE TYPE "sale_order_item_type_new" AS ENUM ('SQUARE_TIMBER');
CREATE TYPE "sale_order_pricing_mode" AS ENUM ('VOLUME', 'PIECE');

-- 2) 计价方式默认按方量
ALTER TABLE "sale_order_items"
  ADD COLUMN "pricing_mode" "sale_order_pricing_mode" NOT NULL DEFAULT 'VOLUME';

-- 3) 删除「其他」明细，并删除因此变成空单的主单
DELETE FROM "sale_order_items" WHERE "product_type" = 'OTHER';

DELETE FROM "sale_orders" o
WHERE NOT EXISTS (SELECT 1 FROM "sale_order_items" i WHERE i."order_id" = o."id");

-- 4) 新增整数毫米列并按四舍五入回填
ALTER TABLE "sale_order_items"
  ADD COLUMN "thickness_mm" INTEGER,
  ADD COLUMN "width_mm" INTEGER,
  ADD COLUMN "length_mm" INTEGER;

UPDATE "sale_order_items"
SET "thickness_mm" = ROUND("thickness_cm" * 10)::integer,
    "width_mm" = ROUND("width_cm" * 10)::integer,
    "length_mm" = ROUND("length_cm" * 10)::integer;

-- 5) 重算明细方量与行金额（按方量）
UPDATE "sale_order_items" i
SET "volume_m3" = v."volume",
    "line_amount" = ROUND(v."volume" * i."price", 2)
FROM (
  SELECT "id",
         ROUND(
           ("thickness_mm"::numeric * "width_mm"::numeric * "length_mm"::numeric * "pieces"::numeric)
           / 1000000000,
           4
         ) AS "volume"
  FROM "sale_order_items"
) v
WHERE i."id" = v."id";

-- 6) 重算主单合计快照
UPDATE "sale_orders" o
SET "total_volume" = agg."total_volume",
    "subtotal_amount" = agg."subtotal_amount",
    "total_amount" = agg."subtotal_amount" + o."other_amount"
FROM (
  SELECT "order_id",
         SUM("volume_m3") AS "total_volume",
         SUM("line_amount" + "other_amount") AS "subtotal_amount"
  FROM "sale_order_items"
  GROUP BY "order_id"
) agg
WHERE o."id" = agg."order_id";

-- 7) 删除旧列与旧枚举，重建产品类型列
ALTER TABLE "sale_order_items"
  DROP COLUMN "thickness_cm",
  DROP COLUMN "width_cm",
  DROP COLUMN "length_cm",
  DROP COLUMN "product_type";

DROP TYPE "sale_order_item_type";

ALTER TYPE "sale_order_item_type_new" RENAME TO "sale_order_item_type";

ALTER TABLE "sale_order_items"
  ADD COLUMN "product_type" "sale_order_item_type" NOT NULL DEFAULT 'SQUARE_TIMBER';

-- 8) 收紧非空
ALTER TABLE "sale_order_items"
  ALTER COLUMN "thickness_mm" SET NOT NULL,
  ALTER COLUMN "width_mm" SET NOT NULL,
  ALTER COLUMN "length_mm" SET NOT NULL,
  ALTER COLUMN "pieces" SET NOT NULL,
  ALTER COLUMN "volume_m3" SET NOT NULL,
  ALTER COLUMN "price" SET NOT NULL;
