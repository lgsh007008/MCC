-- 尺寸叫法与顺序统一（design/order.md §2）：厚度 → 高度。
-- 仅重命名列，数据原样保留；方量等计算结果不受影响（长宽高连乘）。
ALTER TABLE "sale_order_items" RENAME COLUMN "thickness_mm" TO "height_mm";
