-- 资金流水源单 + 销售单结算 + 资产去所属账户 + 账户类型级联（R-财务-002 / R-财务-003 / R-订单-001）

-- 1. 资金流水：源单信息（手工流水三列 NULL，唯一索引允许多个 NULL）
ALTER TABLE "finance_cash_entries" ADD COLUMN "source_type" TEXT;
ALTER TABLE "finance_cash_entries" ADD COLUMN "source_id" UUID;
ALTER TABLE "finance_cash_entries" ADD COLUMN "source_code" TEXT;
CREATE UNIQUE INDEX "finance_cash_entries_tenant_id_source_type_source_id_key"
  ON "finance_cash_entries"("tenant_id", "source_type", "source_id");

-- 2. 销售单：结算方式 / 实收金额 / 收款账户快照
CREATE TYPE "sale_order_settlement_mode" AS ENUM ('CREDIT', 'SETTLED');
ALTER TABLE "sale_orders" ADD COLUMN "settlement_mode" "sale_order_settlement_mode" NOT NULL DEFAULT 'CREDIT';
ALTER TABLE "sale_orders" ADD COLUMN "received_amount" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "sale_orders" ADD COLUMN "settle_account_id" UUID;

-- 3. 固定资产：不再保存所属账户（购置付款改由资金流水源单关联）
ALTER TABLE "fixed_assets" DROP COLUMN "account_id";

-- 4. 账户类型收敛：取消「票据」类型，原票据账户改为「对公 + 承兑汇票」
UPDATE "finance_accounts"
SET "channel" = 'BILL', "updated_at" = CURRENT_TIMESTAMP
WHERE "kind" = 'BILL';

ALTER TABLE "finance_accounts" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TYPE "finance_account_kind" RENAME TO "finance_account_kind_old";
CREATE TYPE "finance_account_kind" AS ENUM ('CORPORATE', 'PERSONAL');
ALTER TABLE "finance_accounts"
  ALTER COLUMN "kind" TYPE "finance_account_kind"
  USING (
    CASE WHEN "kind"::text = 'BILL' THEN 'CORPORATE' ELSE "kind"::text END
  )::"finance_account_kind";
ALTER TABLE "finance_accounts" ALTER COLUMN "kind" SET DEFAULT 'CORPORATE';
DROP TYPE "finance_account_kind_old";
