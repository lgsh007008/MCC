-- 生产记录拆分为「原木领用（MI）」与「方木产出（PR）」两张独立单据
-- （product/生产与库存.md R-生产-001 / R-生产-005）
-- 线上无历史数据：旧生产记录与产出明细直接删除，不做兼容迁移。

DROP TABLE IF EXISTS "production_outputs";
DROP TABLE IF EXISTS "production_records";

-- CreateTable
CREATE TABLE "material_issues" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  "code" TEXT NOT NULL,
  "issue_date" DATE NOT NULL,
  "tons" DECIMAL(12, 3) NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "material_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_outputs" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  "code" TEXT NOT NULL,
  "output_date" DATE NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "production_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_output_lines" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  "output_id" UUID NOT NULL,
  "seq" INTEGER NOT NULL,
  "length_mm" INTEGER NOT NULL,
  "width_mm" INTEGER NOT NULL,
  "height_mm" INTEGER NOT NULL,
  "pieces" INTEGER NOT NULL,
  "volume_m3" DECIMAL(18, 4) NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "production_output_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "material_issues_tenant_id_code_key" ON "material_issues"("tenant_id", "code");
CREATE INDEX "material_issues_issue_date_idx" ON "material_issues"("issue_date");
CREATE UNIQUE INDEX "production_outputs_tenant_id_code_key" ON "production_outputs"("tenant_id", "code");
CREATE INDEX "production_outputs_output_date_idx" ON "production_outputs"("output_date");
CREATE UNIQUE INDEX "production_output_lines_output_id_seq_key" ON "production_output_lines"("output_id", "seq");
CREATE INDEX "production_output_lines_output_id_idx" ON "production_output_lines"("output_id");

-- AddForeignKey
ALTER TABLE "production_output_lines" ADD CONSTRAINT "production_output_lines_output_id_fkey" FOREIGN KEY ("output_id") REFERENCES "production_outputs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
