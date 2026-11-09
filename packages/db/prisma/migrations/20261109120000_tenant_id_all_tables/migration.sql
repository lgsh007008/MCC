-- DropIndex
DROP INDEX "users_username_key";

-- DropIndex
DROP INDEX "refresh_tokens_token_hash_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "event_logs" ADD COLUMN     "tenant_id" TEXT NOT NULL DEFAULT 'default';

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_username_key" ON "users"("tenant_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tenant_id_token_hash_key" ON "refresh_tokens"("tenant_id", "token_hash");