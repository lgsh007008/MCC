-- 多租户启用（ADR-012）：全局表、租户 epoch、去掉 tenant_id 默认值、首个租户与默认套餐。
-- 说明：本迁移不删除历史备份表 finance_events_backup_20261113，也不调整既有 deleted_at 列类型；
-- 这两项是 schema 与历史库的无关差异，避免在本次迁移中做无授权的数据清理。

-- CreateEnum
CREATE TYPE "tenant_status" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "plan_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "platform_user_role" AS ENUM ('PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "platform_user_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- 去掉 tenant_id 数据库默认值：缺失租户上下文时插入直接失败
ALTER TABLE "customers" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "event_logs" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "finance_accounts" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "finance_cash_entries" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "inventory_adjustment_items" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "inventory_adjustments" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "production_outputs" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "production_records" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "purchase_orders" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "refresh_tokens" ADD COLUMN "tenant_epoch" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "sale_order_items" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "sale_orders" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "suppliers" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "tenant_id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "tenant_status" NOT NULL DEFAULT 'ACTIVE',
    "session_epoch" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "name" TEXT NOT NULL,
    "max_accounts" INTEGER NOT NULL,
    "status" "plan_status" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_features" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "plan_id" UUID NOT NULL,
    "feature_code" TEXT NOT NULL,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_features" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "feature_code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tenant_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_users" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "platform_user_role" NOT NULL DEFAULT 'PLATFORM_ADMIN',
    "status" "platform_user_status" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_refresh_tokens" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "token_hash" TEXT NOT NULL,
    "platform_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "platform_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_event_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT,
    "actor_username" TEXT,
    "domain" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "action_label" TEXT,
    "target_tenant_id" TEXT,
    "target_tenant_code" TEXT,
    "target_tenant_name" TEXT,
    "object_type" TEXT,
    "object_id" TEXT,
    "object_code" TEXT,
    "result" TEXT NOT NULL,
    "status_code" INTEGER,
    "error_code" TEXT,
    "method" TEXT,
    "path" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "payload" JSONB,

    CONSTRAINT "platform_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_code_key" ON "tenants"("code");
CREATE INDEX "tenants_status_idx" ON "tenants"("status");
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");
CREATE INDEX "plan_features_plan_id_idx" ON "plan_features"("plan_id");
CREATE UNIQUE INDEX "plan_features_plan_id_feature_code_key" ON "plan_features"("plan_id", "feature_code");
CREATE INDEX "tenant_features_tenant_id_idx" ON "tenant_features"("tenant_id");
CREATE UNIQUE INDEX "tenant_features_tenant_id_feature_code_key" ON "tenant_features"("tenant_id", "feature_code");
CREATE UNIQUE INDEX "platform_users_username_key" ON "platform_users"("username");
CREATE UNIQUE INDEX "platform_refresh_tokens_token_hash_key" ON "platform_refresh_tokens"("token_hash");
CREATE INDEX "platform_refresh_tokens_platform_user_id_idx" ON "platform_refresh_tokens"("platform_user_id");
CREATE INDEX "platform_event_logs_created_at_idx" ON "platform_event_logs"("created_at");
CREATE INDEX "platform_event_logs_actor_id_idx" ON "platform_event_logs"("actor_id");
CREATE INDEX "platform_event_logs_target_tenant_id_idx" ON "platform_event_logs"("target_tenant_id");
CREATE INDEX "platform_event_logs_domain_action_idx" ON "platform_event_logs"("domain", "action");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_features" ADD CONSTRAINT "tenant_features_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_refresh_tokens" ADD CONSTRAINT "platform_refresh_tokens_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 首个租户与默认套餐：保留历史主键 default，登录编号 TN-00001（design/租户.md §9）
INSERT INTO "plans" ("id", "created_at", "updated_at", "name", "max_accounts", "status", "note")
VALUES ('00000000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '标准版', 20, 'ACTIVE', '首个租户的默认套餐，包含当前全部可售模块');

INSERT INTO "tenants" ("id", "created_at", "updated_at", "code", "name", "plan_id", "status", "session_epoch", "note")
VALUES ('default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'TN-00001', '梅好木业', '00000000-0000-0000-0000-000000000001', 'ACTIVE', 0, '历史单租户数据归入本租户');

INSERT INTO "plan_features" ("id", "created_at", "updated_at", "plan_id", "feature_code")
VALUES
  (gen_random_uuid(), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000001', 'order'),
  (gen_random_uuid(), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000001', 'customer'),
  (gen_random_uuid(), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000001', 'purchase'),
  (gen_random_uuid(), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000001', 'supplier'),
  (gen_random_uuid(), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000001', 'production'),
  (gen_random_uuid(), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000001', 'finance'),
  (gen_random_uuid(), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '00000000-0000-0000-0000-000000000001', 'audit');
