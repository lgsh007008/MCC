-- 自助注册开通（R-账号与权限-005）：租户开通渠道 + 手机号验证预留。
-- 存量租户与后续运营开通默认 OPS；自助注册写 SELF_REGISTER，创建后只读。
CREATE TYPE "tenant_source" AS ENUM ('OPS', 'SELF_REGISTER');

ALTER TABLE "tenants" ADD COLUMN "source" "tenant_source" NOT NULL DEFAULT 'OPS';

-- 手机号验证时间：自助注册本轮不验证（NULL），接入短信验证后回填。
ALTER TABLE "users" ADD COLUMN "phone_verified_at" TIMESTAMPTZ(3);
