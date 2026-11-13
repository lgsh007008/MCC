-- 资金流水表单简化：付款对象并入备注，方式由账户渠道推导
-- 历史数据：counterparty 非空时并入 note（无备注直接取对象，有备注为「对象 · 备注」）。

UPDATE "finance_cash_entries"
SET "note" = CASE
    WHEN "note" = '' THEN "counterparty"
    ELSE "counterparty" || ' · ' || "note"
  END,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "counterparty" <> '';

ALTER TABLE "finance_cash_entries" DROP COLUMN "counterparty";
