-- 客户期初欠款（product/customer.md R-客户-001；design/customer.md §2）
-- 上线前已发生的净欠款，只作 finance 计算欠款的基数；历史回款不补录。
-- 非空、默认 0，存量客户自动填 0，无需回填脚本。

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "opening_debt" DECIMAL(14,2) NOT NULL DEFAULT 0;
