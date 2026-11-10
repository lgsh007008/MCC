-- 账号状态（启用 / 停用）与现有 admin 迁移为管理员。
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "users"
  ADD COLUMN "status" "user_status" NOT NULL DEFAULT 'ACTIVE';

UPDATE "users" SET "role" = 'ADMIN' WHERE "username" = 'admin';
