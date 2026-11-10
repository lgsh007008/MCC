-- 财务领域首个迁移（design/finance.md §2）：业务发生台账 finance_events。
-- 单式流水：金额有符号（收入正、支出负）；自动事件由订单域同事务写入，源单唯一约束防重复。

CREATE TYPE "finance_event_category" AS ENUM ('SALES_REVENUE', 'OTHER_REVENUE', 'PURCHASE_COST', 'LABOR_COST', 'OTHER_EXPENSE');
CREATE TYPE "finance_event_source" AS ENUM ('AUTO', 'MANUAL');

CREATE TABLE "finance_events" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "code" TEXT NOT NULL,
    "occurred_date" DATE NOT NULL,
    "category" "finance_event_category" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "source" "finance_event_source" NOT NULL DEFAULT 'MANUAL',
    "source_type" TEXT,
    "source_id" UUID,
    "source_code" TEXT,

    CONSTRAINT "finance_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_events_tenant_id_code_key" ON "finance_events"("tenant_id", "code");
CREATE UNIQUE INDEX "finance_events_tenant_id_source_type_source_id_key" ON "finance_events"("tenant_id", "source_type", "source_id");
CREATE INDEX "finance_events_occurred_date_idx" ON "finance_events"("occurred_date");
CREATE INDEX "finance_events_category_idx" ON "finance_events"("category");
