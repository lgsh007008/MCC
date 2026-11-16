-- 托盘设计领域（pallet）：项目、构件、只读材料目录。
-- 仅新增对象，无删表 / 删列；默认租户开通 pallet_design，其他租户由平台运营开通。

-- CreateEnum
CREATE TYPE "pallet_template_type" AS ENUM ('BLOCK', 'STRINGER', 'NOTCHED', 'SKID', 'PLYWOOD', 'CUSTOM');

-- CreateEnum
CREATE TYPE "pallet_component_role" AS ENUM ('TOP_DECK', 'END_DECK', 'STRINGER_BOARD', 'BLOCK', 'BOTTOM_DECK', 'STRINGER', 'RUNNER', 'PLYWOOD', 'SPACER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "pallet_orientation" AS ENUM ('X', 'Y');

-- CreateEnum
CREATE TYPE "pallet_destination" AS ENUM ('EXPORT', 'DOMESTIC');

-- CreateEnum
CREATE TYPE "pallet_load_type" AS ENUM ('UNIFORM', 'CONCENTRATED');

-- CreateTable
CREATE TABLE "pallet_projects" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL DEFAULT '',
    "template_type" "pallet_template_type" NOT NULL,
    "destination" "pallet_destination" NOT NULL DEFAULT 'DOMESTIC',
    "entry_direction" TEXT NOT NULL DEFAULT '4',
    "length_mm" INTEGER NOT NULL,
    "width_mm" INTEGER NOT NULL,
    "total_height_mm" INTEGER NOT NULL DEFAULT 0,
    "target_load_kg" INTEGER,
    "load_type" "pallet_load_type" NOT NULL DEFAULT 'UNIFORM',
    "total_volume_m3" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "total_weight_kg" DECIMAL(18,1) NOT NULL DEFAULT 0,
    "material_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "processing_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "pallet_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pallet_components" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "project_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" "pallet_component_role" NOT NULL,
    "name" TEXT NOT NULL,
    "material_code" TEXT NOT NULL,
    "orientation" "pallet_orientation" NOT NULL,
    "length_mm" INTEGER NOT NULL,
    "width_mm" INTEGER NOT NULL,
    "height_mm" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "waste_pct" DECIMAL(5,4) NOT NULL DEFAULT 0.08,
    "process_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "price_override" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "pallet_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pallet_materials" (
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
    "is_system" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pallet_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pallet_projects_tenant_id_updated_at_idx" ON "pallet_projects"("tenant_id", "updated_at");

-- CreateIndex
CREATE INDEX "pallet_projects_tenant_id_template_type_idx" ON "pallet_projects"("tenant_id", "template_type");

-- CreateIndex
CREATE UNIQUE INDEX "pallet_projects_tenant_id_code_key" ON "pallet_projects"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "pallet_components_project_id_idx" ON "pallet_components"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "pallet_components_project_id_seq_key" ON "pallet_components"("project_id", "seq");

-- CreateIndex
CREATE INDEX "pallet_materials_tenant_id_idx" ON "pallet_materials"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pallet_materials_tenant_id_code_key" ON "pallet_materials"("tenant_id", "code");

-- AddForeignKey
ALTER TABLE "pallet_components" ADD CONSTRAINT "pallet_components_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "pallet_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 默认租户开通托盘设计；其他租户由平台运营在租户功能开关中开通。
INSERT INTO "tenant_features" ("id", "tenant_id", "feature_code", "enabled", "created_at", "updated_at")
SELECT gen_random_uuid(), 'default', 'pallet_design', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "tenant_features"
    WHERE "tenant_id" = 'default' AND "feature_code" = 'pallet_design'
);
