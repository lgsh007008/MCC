-- 库存调整单操作人快照（design/生产与库存.md §2）：存量 IC 单为空，展示「—」。

ALTER TABLE "inventory_adjustments"
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "created_by_name" TEXT NOT NULL DEFAULT '';
