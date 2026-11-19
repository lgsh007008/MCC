-- 包装设计领域（packaging）：方案 → 单元 → 构件三层，模板、材料与版本。
-- 由托盘设计（pallet）迁移：每个托盘项目生成一个 PALLET 单元；构件迁入 packaging_parts。
-- 旧表与旧枚举在数据迁移完成后删除；编号沿用 PD，不做重排。

-- CreateEnum
CREATE TYPE "packaging_unit_type" AS ENUM ('PALLET', 'CRATE', 'SKID', 'FRAME', 'DIVIDER', 'DUNNAGE', 'STEEL_STRAP');

-- CreateEnum
CREATE TYPE "packaging_project_status" AS ENUM ('DRAFT', 'ISSUED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "packaging_part_role" AS ENUM ('TOP_DECK', 'END_DECK', 'STRINGER_BOARD', 'BLOCK', 'BOTTOM_DECK', 'STRINGER', 'RUNNER', 'PLYWOOD', 'SPACER', 'PANEL', 'FRAME', 'BATTEN', 'STEEL_STRAP', 'DUNNAGE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "packaging_orientation" AS ENUM ('X', 'Y');

-- CreateEnum
CREATE TYPE "packaging_destination" AS ENUM ('EXPORT', 'DOMESTIC');

-- CreateEnum
CREATE TYPE "packaging_load_type" AS ENUM ('UNIFORM', 'CONCENTRATED');

-- CreateTable
CREATE TABLE "packaging_projects" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL DEFAULT '',
    "destination" "packaging_destination" NOT NULL DEFAULT 'DOMESTIC',
    "status" "packaging_project_status" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT NOT NULL DEFAULT '',
    "total_volume_m3" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "total_weight_kg" DECIMAL(18,1) NOT NULL DEFAULT 0,
    "material_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "processing_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "current_revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "packaging_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_units" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "project_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "unit_type" "packaging_unit_type" NOT NULL,
    "template_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "length_mm" INTEGER NOT NULL,
    "width_mm" INTEGER NOT NULL,
    "total_height_mm" INTEGER NOT NULL DEFAULT 0,
    "target_load_kg" INTEGER,
    "load_type" "packaging_load_type" NOT NULL DEFAULT 'UNIFORM',
    "params" JSONB NOT NULL DEFAULT '{}',
    "total_volume_m3" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "total_weight_kg" DECIMAL(18,1) NOT NULL DEFAULT 0,
    "material_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "processing_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "packaging_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_parts" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "unit_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" "packaging_part_role" NOT NULL,
    "name" TEXT NOT NULL,
    "material_code" TEXT NOT NULL,
    "orientation" "packaging_orientation" NOT NULL,
    "length_mm" INTEGER NOT NULL,
    "width_mm" INTEGER NOT NULL,
    "height_mm" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "waste_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.08,
    "process_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "price_override" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "packaging_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_templates" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "code" TEXT NOT NULL,
    "unit_type" "packaging_unit_type" NOT NULL,
    "name" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "packaging_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_materials" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "density_kg_m3" INTEGER NOT NULL,
    "price_per_m3" DECIMAL(12,2) NOT NULL,
    "fumigation" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL DEFAULT '#b9824e',
    "applicable_unit_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_system" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "packaging_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_revisions" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "project_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "issued_by" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_volume_m3" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "total_weight_kg" DECIMAL(18,1) NOT NULL DEFAULT 0,
    "material_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "processing_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "packaging_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "packaging_projects_tenant_id_updated_at_idx" ON "packaging_projects"("tenant_id", "updated_at");

-- CreateIndex
CREATE INDEX "packaging_projects_tenant_id_status_idx" ON "packaging_projects"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_projects_tenant_id_code_key" ON "packaging_projects"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "packaging_units_project_id_idx" ON "packaging_units"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_units_project_id_seq_key" ON "packaging_units"("project_id", "seq");

-- CreateIndex
CREATE INDEX "packaging_parts_unit_id_idx" ON "packaging_parts"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_parts_unit_id_seq_key" ON "packaging_parts"("unit_id", "seq");

-- CreateIndex
CREATE INDEX "packaging_templates_tenant_id_unit_type_idx" ON "packaging_templates"("tenant_id", "unit_type");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_templates_tenant_id_code_key" ON "packaging_templates"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "packaging_materials_tenant_id_idx" ON "packaging_materials"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_materials_tenant_id_code_key" ON "packaging_materials"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "packaging_revisions_project_id_idx" ON "packaging_revisions"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_revisions_project_id_revision_no_key" ON "packaging_revisions"("project_id", "revision_no");

-- AddForeignKey
ALTER TABLE "packaging_units" ADD CONSTRAINT "packaging_units_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "packaging_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_parts" ADD CONSTRAINT "packaging_parts_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "packaging_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_revisions" ADD CONSTRAINT "packaging_revisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "packaging_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 回填：托盘项目 → 包装方案 + 单个 PALLET 单元
INSERT INTO "packaging_projects" (
    "id", "tenant_id", "created_at", "updated_at", "deleted_at", "code", "name",
    "customer_name", "destination", "status", "note", "total_volume_m3",
    "total_weight_kg", "material_cost", "processing_cost", "current_revision"
)
SELECT
    p."id", p."tenant_id", p."created_at", p."updated_at", p."deleted_at", p."code", p."name",
    p."customer_name", p."destination"::text::"packaging_destination", 'DRAFT', p."note",
    p."total_volume_m3", p."total_weight_kg", p."material_cost", p."processing_cost", 0
FROM "pallet_projects" p;

-- 回填：每个托盘项目生成一个 PALLET 单元；托盘模板 code 使用小写
INSERT INTO "packaging_units" (
    "id", "tenant_id", "created_at", "updated_at", "deleted_at", "project_id", "seq",
    "unit_type", "template_code", "name", "length_mm", "width_mm", "total_height_mm",
    "target_load_kg", "load_type", "params", "total_volume_m3", "total_weight_kg",
    "material_cost", "processing_cost"
)
SELECT
    gen_random_uuid(), p."tenant_id", p."created_at", p."updated_at", p."deleted_at", p."id", 1,
    'PALLET', lower(p."template_type"::text), p."name", p."length_mm", p."width_mm", p."total_height_mm",
    p."target_load_kg", p."load_type"::text::"packaging_load_type",
    jsonb_build_object('entryDirection', p."entry_direction"),
    p."total_volume_m3", p."total_weight_kg", p."material_cost", p."processing_cost"
FROM "pallet_projects" p;

-- 回填：托盘构件 → 单元构件
INSERT INTO "packaging_parts" (
    "id", "tenant_id", "created_at", "updated_at", "deleted_at", "unit_id", "seq",
    "role", "name", "material_code", "orientation", "length_mm", "width_mm", "height_mm",
    "quantity", "waste_pct", "process_cost", "price_override"
)
SELECT
    gen_random_uuid(), c."tenant_id", c."created_at", c."updated_at", c."deleted_at", u."id", c."seq",
    c."role"::text::"packaging_part_role", c."name", c."material_code",
    c."orientation"::text::"packaging_orientation", c."length_mm", c."width_mm", c."height_mm",
    c."quantity", c."waste_pct", c."process_cost", c."price_override"
FROM "pallet_components" c
JOIN "packaging_units" u ON u."project_id" = c."project_id";

-- 回填：托盘材料 → 包装材料；空数组表示全部单元类型可用
INSERT INTO "packaging_materials" (
    "id", "tenant_id", "created_at", "updated_at", "deleted_at", "code", "name",
    "density_kg_m3", "price_per_m3", "fumigation", "color", "applicable_unit_types", "is_system"
)
SELECT
    m."id", m."tenant_id", m."created_at", m."updated_at", m."deleted_at", m."code", m."name",
    m."density_kg_m3", m."price_per_m3", m."fumigation", m."color", ARRAY[]::TEXT[], m."is_system"
FROM "pallet_materials" m;

-- 功能标识迁移：pallet_design → packaging_design；新旧并存时保留一条，避免唯一键冲突
DELETE FROM "tenant_features" a
USING "tenant_features" b
WHERE a."feature_code" = 'packaging_design'
  AND b."feature_code" = 'pallet_design'
  AND a."tenant_id" = b."tenant_id";

UPDATE "tenant_features" SET "feature_code" = 'packaging_design' WHERE "feature_code" = 'pallet_design';

DELETE FROM "plan_features" a
USING "plan_features" b
WHERE a."feature_code" = 'packaging_design'
  AND b."feature_code" = 'pallet_design'
  AND a."plan_id" = b."plan_id";

UPDATE "plan_features" SET "feature_code" = 'packaging_design' WHERE "feature_code" = 'pallet_design';

-- 删除旧表与旧枚举
DROP TABLE "pallet_components";
DROP TABLE "pallet_projects";
DROP TABLE "pallet_materials";

DROP TYPE "pallet_template_type";
DROP TYPE "pallet_component_role";
DROP TYPE "pallet_orientation";
DROP TYPE "pallet_destination";
DROP TYPE "pallet_load_type";
