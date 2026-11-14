-- 删除采购单「折价说明」（product/purchase.md R-采购-001）
-- 送货吨数与结算吨数本身已体现折价，不再单独记录文字说明。

ALTER TABLE "purchase_orders" DROP COLUMN "discount_note";
