-- 固定资产模块下线（product/finance.md v20261113）：购置支出改由资金流水 ASSET_PURCHASE 分类留痕。
DROP TABLE IF EXISTS "fixed_assets";
DROP TYPE IF EXISTS "fixed_asset_category";
DROP TYPE IF EXISTS "fixed_asset_status";
