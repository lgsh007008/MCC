-- 多租户复合索引（ADR-005）：server 数据访问层给每条查询自动附加 tenant_id = ?，
-- 原单列日期索引无法同时满足「按租户过滤 + 按日期排序」，多租户后会退化为全表扫。
-- 统一补 (tenant_id, 列表排序字段) 复合索引；原单列索引保留，供跨租户/平台侧查询使用。

CREATE INDEX "customers_tenant_id_created_at_idx" ON "customers"("tenant_id", "created_at");

CREATE INDEX "suppliers_tenant_id_created_at_idx" ON "suppliers"("tenant_id", "created_at");

CREATE INDEX "purchase_orders_tenant_id_purchase_date_idx" ON "purchase_orders"("tenant_id", "purchase_date");

CREATE INDEX "sale_orders_tenant_id_sale_date_idx" ON "sale_orders"("tenant_id", "sale_date");

CREATE INDEX "finance_accounts_tenant_id_created_at_idx" ON "finance_accounts"("tenant_id", "created_at");

CREATE INDEX "finance_cash_entries_tenant_id_occurred_date_idx" ON "finance_cash_entries"("tenant_id", "occurred_date");

CREATE INDEX "material_issues_tenant_id_issue_date_idx" ON "material_issues"("tenant_id", "issue_date");

CREATE INDEX "production_outputs_tenant_id_output_date_idx" ON "production_outputs"("tenant_id", "output_date");

CREATE INDEX "inventory_adjustments_tenant_id_adjustment_date_idx" ON "inventory_adjustments"("tenant_id", "adjustment_date");
