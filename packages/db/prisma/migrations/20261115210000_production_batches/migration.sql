-- 轻量生产批次（product/生产与库存.md R-生产-006）：
-- 批次作为成本对象，领用与产出必须归属批次；销售按批次先进先出扣层。
-- 线上无历史生产数据：旧领用 / 产出 / 盘点直接删除；期初保留并迁入「期初库存批次」。

DELETE FROM "production_output_lines";
DELETE FROM "production_outputs";
DELETE FROM "material_issues";
DELETE FROM "inventory_adjustment_items"
WHERE "adjustment_id" IN (SELECT "id" FROM "inventory_adjustments" WHERE "type" = 'COUNT');
DELETE FROM "inventory_adjustments" WHERE "type" = 'COUNT';

-- CreateEnum
CREATE TYPE "production_batch_status" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "production_batch_kind" AS ENUM ('OPENING', 'PRODUCTION');

-- CreateTable
CREATE TABLE "production_batches" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  "code" TEXT NOT NULL,
  "batch_date" DATE NOT NULL,
  "status" "production_batch_status" NOT NULL DEFAULT 'OPEN',
  "kind" "production_batch_kind" NOT NULL DEFAULT 'PRODUCTION',
  "note" TEXT NOT NULL DEFAULT '',
  "closed_at" TIMESTAMPTZ(3),
  CONSTRAINT "production_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "production_batches_tenant_id_code_key" ON "production_batches"("tenant_id", "code");
CREATE INDEX "production_batches_tenant_id_batch_date_idx" ON "production_batches"("tenant_id", "batch_date");
CREATE INDEX "production_batches_tenant_id_status_idx" ON "production_batches"("tenant_id", "status");
CREATE INDEX "production_batches_batch_date_idx" ON "production_batches"("batch_date");

-- 期初方木迁入期初库存批次（每个租户一个；无期初方木则不建）
INSERT INTO "production_batches" (
  "id", "tenant_id", "created_at", "updated_at", "code", "batch_date", "status", "kind", "note", "closed_at"
)
SELECT
  gen_random_uuid(),
  a."tenant_id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'BT-00001',
  a."adjustment_date",
  'CLOSED'::"production_batch_status",
  'OPENING'::"production_batch_kind",
  '期初库存批次',
  CURRENT_TIMESTAMP
FROM "inventory_adjustments" a
WHERE a."type" = 'OPENING'
  AND a."deleted_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "inventory_adjustment_items" i
    WHERE i."adjustment_id" = a."id"
      AND i."target_type" = 'TIMBER'
      AND i."deleted_at" IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "production_batches" b
    WHERE b."tenant_id" = a."tenant_id"
      AND b."kind" = 'OPENING'
      AND b."deleted_at" IS NULL
  );

-- AlterTable
ALTER TABLE "material_issues" ADD COLUMN "batch_id" UUID NOT NULL;
ALTER TABLE "production_outputs" ADD COLUMN "batch_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "material_issues_batch_id_idx" ON "material_issues"("batch_id");
CREATE INDEX "production_outputs_batch_id_idx" ON "production_outputs"("batch_id");

-- AddForeignKey
ALTER TABLE "material_issues" ADD CONSTRAINT "material_issues_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_outputs" ADD CONSTRAINT "production_outputs_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "sale_order_cost_layers" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  "order_id" UUID NOT NULL,
  "seq" INTEGER NOT NULL,
  "batch_code" TEXT NOT NULL,
  "length_mm" INTEGER NOT NULL,
  "width_mm" INTEGER NOT NULL,
  "height_mm" INTEGER NOT NULL,
  "volume_m3" DECIMAL(18, 4) NOT NULL,
  "unit_cost" DECIMAL(18, 6) NOT NULL,
  "amount" DECIMAL(18, 2) NOT NULL,
  CONSTRAINT "sale_order_cost_layers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sale_order_cost_layers_order_id_seq_key" ON "sale_order_cost_layers"("order_id", "seq");
CREATE INDEX "sale_order_cost_layers_order_id_idx" ON "sale_order_cost_layers"("order_id");

-- AddForeignKey
ALTER TABLE "sale_order_cost_layers" ADD CONSTRAINT "sale_order_cost_layers_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "sale_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
