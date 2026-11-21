-- 登录标识改为全局唯一手机号（ADR-015）。
-- phone 允许为空：停用账号可不补手机号；启用账号必须在发布新登录前补齐真实手机号。
ALTER TABLE "users" ADD COLUMN "phone" TEXT;

ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
