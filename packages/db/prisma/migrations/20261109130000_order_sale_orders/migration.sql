-- CreateEnum
CREATE TYPE "sale_order_item_type" AS ENUM ('BOARD', 'OTHER');

-- CreateTable
CREATE TABLE "sale_orders" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "code" TEXT NOT NULL,
    "sale_date" DATE NOT NULL,
    "customer_name" TEXT NOT NULL,
    "total_volume" DECIMAL(18,4) NOT NULL,
    "subtotal_amount" DECIMAL(18,2) NOT NULL,
    "other_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "sale_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_order_items" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "order_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "product_type" "sale_order_item_type" NOT NULL,
    "thickness_cm" DECIMAL(10,3),
    "width_cm" DECIMAL(10,3),
    "length_cm" DECIMAL(10,3),
    "pieces" INTEGER,
    "volume_m3" DECIMAL(18,4),
    "price" DECIMAL(18,2),
    "line_amount" DECIMAL(18,2) NOT NULL,
    "other_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "sale_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sale_orders_tenant_id_code_key" ON "sale_orders"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "sale_orders_sale_date_idx" ON "sale_orders"("sale_date");

-- CreateIndex
CREATE UNIQUE INDEX "sale_order_items_order_id_seq_key" ON "sale_order_items"("order_id", "seq");

-- CreateIndex
CREATE INDEX "sale_order_items_order_id_idx" ON "sale_order_items"("order_id");

-- AddForeignKey
ALTER TABLE "sale_order_items" ADD CONSTRAINT "sale_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sale_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;