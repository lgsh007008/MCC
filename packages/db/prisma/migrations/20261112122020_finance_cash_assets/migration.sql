-- AlterTable
ALTER TABLE "finance_accounts" ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "finance_cash_entries" ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "finance_events" ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "fixed_assets" ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMP(3);
