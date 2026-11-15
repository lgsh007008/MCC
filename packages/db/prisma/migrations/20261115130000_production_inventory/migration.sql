-- 生产与库存领域（product/生产与库存.md / design/生产与库存.md）
-- 全部为新增表与新增列，无破坏性动作。

-- CreateEnum
CREATE TYPE "sale_order_material_cost_status" AS ENUM ('PENDING', 'FINAL');
CREATE TYPE "inventory_adjustment_type" AS ENUM ('OPENING', 'COUNT');
CREATE TYPE "inventory_target_type" AS ENUM ('RAW_LOG', 'TIMBER');
CREATE TYPE "inventory_adjustment_reason" AS ENUM ('OPENING', 'COUNT_GAIN', 'COUNT_LOSS', 'MEASUREMENT', 'MISSING', 'OTHER');

-- AlterTable
ALTER TABLE "sale_orders"
  ADD COLUMN "material_unit_cost" DECIMAL(18, 6),
  ADD COLUMN "material_cost_amount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "material_cost_status" "sale_order_material_cost_status" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "material_cost_snapshotted_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "production_records" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL DEFAULT 'default',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  "code" TEXT NOT NULL,
  "production_date" DATE NOT NULL,
  "consumed_tons" DECIMAL(12, 3) NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "production_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_outputs" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL DEFAULT 'default',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  "record_id" UUID NOT NULL,
  "seq" INTEGER NOT NULL,
  "length_mm" INTEGER NOT NULL,
  "width_mm" INTEGER NOT NULL,
  "height_mm" INTEGER NOT NULL,
  "pieces" INTEGER NOT NULL,
  "volume_m3" DECIMAL(18, 4) NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "production_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL DEFAULT 'default',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  "code" TEXT NOT NULL,
  "adjustment_date" DATE NOT NULL,
  "type" "inventory_adjustment_type" NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustment_items" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL DEFAULT 'default',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  "adjustment_id" UUID NOT NULL,
  "target_type" "inventory_target_type" NOT NULL,
  "length_mm" INTEGER,
  "width_mm" INTEGER,
  "height_mm" INTEGER,
  "book_quantity" DECIMAL(18, 4) NOT NULL,
  "actual_quantity" DECIMAL(18, 4) NOT NULL,
  "difference_quantity" DECIMAL(18, 4) NOT NULL,
  "unit_cost" DECIMAL(18, 6) NOT NULL,
  "amount" DECIMAL(18, 2) NOT NULL,
  "reason" "inventory_adjustment_reason" NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "inventory_adjustment_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "production_records_tenant_id_code_key" ON "production_records"("tenant_id", "code");
CREATE INDEX "production_records_production_date_idx" ON "production_records"("production_date");
CREATE UNIQUE INDEX "production_outputs_record_id_seq_key" ON "production_outputs"("record_id", "seq");
CREATE INDEX "production_outputs_record_id_idx" ON "production_outputs"("record_id");
CREATE UNIQUE INDEX "inventory_adjustments_tenant_id_code_key" ON "inventory_adjustments"("tenant_id", "code");
CREATE INDEX "inventory_adjustments_adjustment_date_idx" ON "inventory_adjustments"("adjustment_date");
CREATE INDEX "inventory_adjustment_items_adjustment_id_idx" ON "inventory_adjustment_items"("adjustment_id");
CREATE INDEX "inventory_adjustment_items_target_type_idx" ON "inventory_adjustment_items"("target_type");

-- AddForeignKey
ALTER TABLE "production_outputs" ADD CONSTRAINT "production_outputs_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "production_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_adjustment_items" ADD CONSTRAINT "inventory_adjustment_items_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "inventory_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
