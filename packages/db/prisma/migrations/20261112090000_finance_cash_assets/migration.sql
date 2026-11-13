-- 资金收付与固定资产（R-财务-002 / R-财务-003）
CREATE TYPE "finance_account_kind" AS ENUM ('CORPORATE', 'PERSONAL', 'BILL');
CREATE TYPE "finance_account_channel" AS ENUM ('BANK', 'WECHAT', 'ALIPAY', 'CASH', 'BILL');
CREATE TYPE "finance_cash_direction" AS ENUM ('IN', 'OUT', 'TRANSFER');
CREATE TYPE "finance_cash_method" AS ENUM ('BANK', 'WECHAT', 'ALIPAY', 'CASH', 'ACCEPTANCE');
CREATE TYPE "fixed_asset_category" AS ENUM ('EQUIPMENT', 'VEHICLE', 'BUILDING', 'OTHER');
CREATE TYPE "fixed_asset_status" AS ENUM ('IN_USE', 'IDLE', 'DISPOSED');

CREATE TABLE "finance_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "finance_account_kind" NOT NULL DEFAULT 'CORPORATE',
    "channel" "finance_account_channel" NOT NULL DEFAULT 'BANK',
    "opening_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "finance_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "finance_accounts_tenant_id_code_key" ON "finance_accounts"("tenant_id", "code");
CREATE INDEX "finance_accounts_name_idx" ON "finance_accounts"("name");

CREATE TABLE "finance_cash_entries" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "code" TEXT NOT NULL,
    "direction" "finance_cash_direction" NOT NULL,
    "occurred_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "account_id" UUID NOT NULL,
    "to_account_id" UUID,
    "customer_id" UUID,
    "customer_name" TEXT NOT NULL DEFAULT '',
    "counterparty" TEXT NOT NULL DEFAULT '',
    "method" "finance_cash_method" NOT NULL DEFAULT 'BANK',
    "note" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "finance_cash_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "finance_cash_entries_tenant_id_code_key" ON "finance_cash_entries"("tenant_id", "code");
CREATE INDEX "finance_cash_entries_occurred_date_idx" ON "finance_cash_entries"("occurred_date");
CREATE INDEX "finance_cash_entries_account_id_idx" ON "finance_cash_entries"("account_id");
CREATE INDEX "finance_cash_entries_customer_id_idx" ON "finance_cash_entries"("customer_id");
ALTER TABLE "finance_cash_entries" ADD CONSTRAINT "finance_cash_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_cash_entries" ADD CONSTRAINT "finance_cash_entries_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "fixed_assets" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "fixed_asset_category" NOT NULL DEFAULT 'EQUIPMENT',
    "purchased_at" DATE NOT NULL,
    "original_cost" DECIMAL(18,2) NOT NULL,
    "account_id" UUID,
    "status" "fixed_asset_status" NOT NULL DEFAULT 'IN_USE',
    "note" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fixed_assets_tenant_id_code_key" ON "fixed_assets"("tenant_id", "code");
CREATE INDEX "fixed_assets_purchased_at_idx" ON "fixed_assets"("purchased_at");
