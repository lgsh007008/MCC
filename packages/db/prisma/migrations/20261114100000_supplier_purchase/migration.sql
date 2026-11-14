-- 供应商与采购（product/supplier.md R-供应商-001；product/purchase.md R-采购-001）
-- 供应商 = 长期往来实体，期初应付为唯一金额列；采购单为单头单据。
-- 财务流水增加供应商维度（仅采购付款使用）。系统无历史采购与采购付款流水，无需回填。

-- CreateEnum
CREATE TYPE "supplier_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "purchase_settlement_mode" AS ENUM ('CREDIT', 'SETTLED');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL DEFAULT '',
    "status" "supplier_status" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT NOT NULL DEFAULT '',
    "opening_payable" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "code" TEXT NOT NULL,
    "purchase_date" DATE NOT NULL,
    "supplier_id" UUID NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "delivered_tons" DECIMAL(12,3) NOT NULL,
    "settled_tons" DECIMAL(12,3) NOT NULL,
    "discount_note" TEXT NOT NULL DEFAULT '',
    "unit_price" DECIMAL(12,2) NOT NULL,
    "subtotal_amount" DECIMAL(18,2) NOT NULL,
    "other_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "settlement_mode" "purchase_settlement_mode" NOT NULL DEFAULT 'CREDIT',
    "settle_account_id" UUID,
    "paid_amount" DECIMAL(18,2),

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "finance_cash_entries" ADD COLUMN "supplier_id" UUID,
ADD COLUMN "supplier_name" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_code_key" ON "suppliers"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_code_key" ON "purchase_orders"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "purchase_orders_purchase_date_idx" ON "purchase_orders"("purchase_date");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "finance_cash_entries_supplier_id_idx" ON "finance_cash_entries"("supplier_id");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
