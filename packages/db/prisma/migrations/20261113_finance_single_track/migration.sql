-- 财务单轨制：资金流水增加收支分类，业务发生台账退场（R-财务-001 / R-财务-002）
-- 流水成为唯一录入入口；销售收入由销售单实时聚合，其他收支由流水分类承载。

-- 1. 收支分类枚举与列（内部转账为 NULL）
CREATE TYPE "finance_cash_category" AS ENUM (
  'SALES_RECEIPT',
  'OTHER_REVENUE',
  'LOAN_IN',
  'PURCHASE_PAYMENT',
  'LABOR_COST',
  'OPERATING_EXPENSE',
  'ASSET_PURCHASE',
  'LOAN_REPAY'
);
ALTER TABLE "finance_cash_entries" ADD COLUMN "category" "finance_cash_category";

-- 2. 历史流水回填
-- 2.1 销售单现结派生的收款流水
UPDATE "finance_cash_entries"
SET "category" = 'SALES_RECEIPT', "updated_at" = CURRENT_TIMESTAMP
WHERE "source_type" = 'sale_order';

-- 2.2 固定资产购置付款：转为普通付款流水，分类 = 资产购置，源单三列置空
UPDATE "finance_cash_entries"
SET "category" = 'ASSET_PURCHASE', "updated_at" = CURRENT_TIMESTAMP
WHERE "source_type" = 'fixed_asset';
UPDATE "finance_cash_entries"
SET "source_type" = NULL, "source_id" = NULL, "source_code" = NULL, "updated_at" = CURRENT_TIMESTAMP
WHERE "source_type" = 'fixed_asset';

-- 2.3 手工流水：收款有客户 = 销售回款，无客户 = 其他收入；付款统一先归「费用」
UPDATE "finance_cash_entries"
SET "category" = 'SALES_RECEIPT', "updated_at" = CURRENT_TIMESTAMP
WHERE "direction" = 'IN' AND "customer_id" IS NOT NULL AND "category" IS NULL;
UPDATE "finance_cash_entries"
SET "category" = 'OTHER_REVENUE', "updated_at" = CURRENT_TIMESTAMP
WHERE "direction" = 'IN' AND "customer_id" IS NULL AND "category" IS NULL;
UPDATE "finance_cash_entries"
SET "category" = 'OPERATING_EXPENSE', "updated_at" = CURRENT_TIMESTAMP
WHERE "direction" = 'OUT' AND "category" IS NULL;

-- 3. 业务发生台账退场
-- 3.1 全量备份事件表（含未联动流水的手工事件），供人工复核
-- 枚举列转 text，避免备份表反向依赖即将删除的事件枚举
CREATE TABLE "finance_events_backup_20261113" AS
SELECT
  "id",
  "tenant_id",
  "created_at",
  "updated_at",
  "deleted_at",
  "code",
  "occurred_date",
  "category"::text AS "category",
  "amount",
  "note",
  "source"::text AS "source",
  "source_type",
  "source_id",
  "source_code"
FROM "finance_events";

-- 3.2 已由事件派生的流水：按事件分类补分类，再解除源单绑定
UPDATE "finance_cash_entries" ce
SET "category" = CASE
    WHEN e."category" = 'OTHER_REVENUE' THEN 'OTHER_REVENUE'::"finance_cash_category"
    ELSE 'OPERATING_EXPENSE'::"finance_cash_category"
  END,
  "updated_at" = CURRENT_TIMESTAMP
FROM "finance_events" e
WHERE ce."source_type" = 'finance_event'
  AND ce."source_id" = e."id"
  AND ce."category" IS NULL;
UPDATE "finance_cash_entries"
SET "source_type" = NULL, "source_id" = NULL, "source_code" = NULL, "updated_at" = CURRENT_TIMESTAMP
WHERE "source_type" = 'finance_event';

-- 3.3 删除事件表与枚举
DROP TABLE "finance_events";
DROP TYPE "finance_event_source";
DROP TYPE "finance_event_category";

-- 4. 分类索引
CREATE INDEX "finance_cash_entries_category_idx" ON "finance_cash_entries"("category");
