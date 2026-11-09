-- 客户档案（product/customer.md R-客户-001；design/customer.md §2）
-- 顺序：建表 → 回填客户 → 销售单加可空外键并回填 → 收紧为非空 → 索引与外键。
-- 存量销售单只有客户名称文本，回填时按（租户，名称）去重建档，编号按首次出现顺序分配。

-- CreateEnum
CREATE TYPE "customer_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL DEFAULT '',
    "status" "customer_status" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_code_key" ON "customers"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- 回填：每个租户下出现过的客户名各建一条档案（编号按首次出现顺序分配）
WITH distinct_names AS (
    SELECT "tenant_id", "customer_name", MIN("created_at") AS first_seen
    FROM "sale_orders"
    GROUP BY "tenant_id", "customer_name"
),
numbered AS (
    SELECT "tenant_id", "customer_name", first_seen,
           ROW_NUMBER() OVER (PARTITION BY "tenant_id" ORDER BY first_seen, "customer_name") AS rn
    FROM distinct_names
)
INSERT INTO "customers" ("id", "tenant_id", "created_at", "updated_at", "code", "name", "contact", "status", "note")
SELECT gen_random_uuid(), "tenant_id", first_seen, CURRENT_TIMESTAMP,
       'C' || LPAD(rn::text, 5, '0'), "customer_name", '', 'ACTIVE', ''
FROM numbered;

-- AlterTable：先加可空列，回填后再收紧为 NOT NULL
ALTER TABLE "sale_orders" ADD COLUMN "customer_id" UUID;

UPDATE "sale_orders" s
SET "customer_id" = c."id"
FROM "customers" c
WHERE c."tenant_id" = s."tenant_id" AND c."name" = s."customer_name";

ALTER TABLE "sale_orders" ALTER COLUMN "customer_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "sale_orders_customer_id_idx" ON "sale_orders"("customer_id");

-- AddForeignKey
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
