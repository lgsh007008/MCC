import { Injectable } from '@nestjs/common';
import { Prisma } from '@mcc/db';
import {
  buildPalletGeometry,
  calcPalletBom,
  hasPalletErrors,
  PALLET_DEFAULT_MATERIALS,
  validatePalletStructure,
  type PalletComponentInput,
  type PalletComponentRole,
  type PalletDestination,
  type PalletListQuery,
  type PalletLoadType,
  type PalletMaterialLike,
  type PalletProjectInput,
  type PalletTemplateType,
} from '@mcc/shared';
import { problem } from '../../common/http-problem.js';
import { PrismaService } from '../../common/prisma.service.js';
import { currentTenantId } from '../../common/prisma-tenant.extension.js';
import type {
  PalletComponentDto,
  PalletMaterialDto,
  PalletProjectDto,
  PalletProjectListItemDto,
  PalletProjectListDto,
} from './dto/pallet.dto.js';

// 托盘设计领域（product/托盘设计.md；design/托盘设计.md）。
// 编号 PD + 连字符 + 5 位流水（不含日期，见 1-产品文档.md 五）；合计由服务端重算落库。

const CODE_RETRY_LIMIT = 3;
const CODE_PREFIX = 'PD-';
const CODE_PAD = 5;

const TEMPLATE_TO_DB = {
  block: 'BLOCK',
  stringer: 'STRINGER',
  notched: 'NOTCHED',
  skid: 'SKID',
  plywood: 'PLYWOOD',
  custom: 'CUSTOM',
} as const;

const ROLE_TO_DB = {
  topDeck: 'TOP_DECK',
  endDeck: 'END_DECK',
  stringerBoard: 'STRINGER_BOARD',
  block: 'BLOCK',
  bottomDeck: 'BOTTOM_DECK',
  stringer: 'STRINGER',
  runner: 'RUNNER',
  plywood: 'PLYWOOD',
  spacer: 'SPACER',
  custom: 'CUSTOM',
} as const;

const ROLE_FROM_DB: Record<string, PalletComponentRole> = {
  TOP_DECK: 'topDeck',
  END_DECK: 'endDeck',
  STRINGER_BOARD: 'stringerBoard',
  BLOCK: 'block',
  BOTTOM_DECK: 'bottomDeck',
  STRINGER: 'stringer',
  RUNNER: 'runner',
  PLYWOOD: 'plywood',
  SPACER: 'spacer',
  CUSTOM: 'custom',
};

const TEMPLATE_FROM_DB: Record<string, PalletTemplateType> = {
  BLOCK: 'block',
  STRINGER: 'stringer',
  NOTCHED: 'notched',
  SKID: 'skid',
  PLYWOOD: 'plywood',
  CUSTOM: 'custom',
};

const DESTINATION_TO_DB = { export: 'EXPORT', domestic: 'DOMESTIC' } as const;
const LOAD_TO_DB = { uniform: 'UNIFORM', concentrated: 'CONCENTRATED' } as const;

type ProjectWithComponents = Prisma.PalletProjectGetPayload<{ include: { components: true } }>;
type ProjectRow = Prisma.PalletProjectGetPayload<object>;
type ComponentRow = Prisma.PalletComponentGetPayload<object>;
type MaterialRow = Prisma.PalletMaterialGetPayload<object>;

const iso = (value: Date): string => value.toISOString();

const toMaterialLike = (row: MaterialRow): PalletMaterialLike => ({
  code: row.code,
  name: row.name,
  densityKgM3: row.densityKgM3,
  pricePerM3: Number(row.pricePerM3),
  fumigation: row.fumigation,
  color: row.color,
});

const toComponentDto = (row: ComponentRow): PalletComponentDto => ({
  id: row.id,
  seq: row.seq,
  role: ROLE_FROM_DB[row.role] ?? 'custom',
  name: row.name,
  materialCode: row.materialCode,
  orientation: row.orientation === 'Y' ? 'y' : 'x',
  lengthMm: row.lengthMm,
  widthMm: row.widthMm,
  heightMm: row.heightMm,
  quantity: row.quantity,
  wastePct: Number(row.wastePct),
  processCost: Number(row.processCost),
  priceOverride: Number(row.priceOverride),
});

const toProjectDto = (row: ProjectWithComponents): PalletProjectDto => ({
  id: row.id,
  code: row.code,
  name: row.name,
  customerName: row.customerName,
  templateType: TEMPLATE_FROM_DB[row.templateType] ?? 'custom',
  destination: row.destination === 'EXPORT' ? 'export' : 'domestic',
  entryDirection: row.entryDirection,
  lengthMm: row.lengthMm,
  widthMm: row.widthMm,
  totalHeightMm: row.totalHeightMm,
  targetLoadKg: row.targetLoadKg,
  loadType: row.loadType === 'CONCENTRATED' ? 'concentrated' : 'uniform',
  totalVolumeM3: row.totalVolumeM3.toFixed(5),
  totalWeightKg: row.totalWeightKg.toFixed(1),
  materialCost: row.materialCost.toFixed(2),
  processingCost: row.processingCost.toFixed(2),
  note: row.note,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  components: row.components
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map(toComponentDto),
});

const toListDto = (row: ProjectRow): PalletProjectListItemDto => ({
  id: row.id,
  code: row.code,
  name: row.name,
  customerName: row.customerName,
  templateType: TEMPLATE_FROM_DB[row.templateType] ?? 'custom',
  lengthMm: row.lengthMm,
  widthMm: row.widthMm,
  totalHeightMm: row.totalHeightMm,
  totalVolumeM3: row.totalVolumeM3.toFixed(5),
  totalWeightKg: row.totalWeightKg.toFixed(1),
  updatedAt: iso(row.updatedAt),
});

@Injectable()
export class PalletService {
  constructor(private readonly prisma: PrismaService) {}

  // 编号：事务内取 PD- 前缀最大流水 +1；唯一约束兜底并发，P2002 重试。
  private nextCode(tx: Prisma.TransactionClient): Promise<string> {
    return tx.palletProject
      .findFirst({
        where: { code: { startsWith: CODE_PREFIX } },
        orderBy: { code: 'desc' },
        select: { code: true },
      })
      .then((last) => {
        const seq = last ? Number(last.code.slice(CODE_PREFIX.length)) + 1 : 1;
        return `${CODE_PREFIX}${String(seq).padStart(CODE_PAD, '0')}`;
      });
  }

  async list(query: PalletListQuery): Promise<PalletProjectListDto> {
    const where: Prisma.PalletProjectWhereInput = { deletedAt: null };
    if (query.keyword) {
      where.OR = [
        { code: { contains: query.keyword } },
        { name: { contains: query.keyword } },
        { customerName: { contains: query.keyword } },
      ];
    }
    if (query.templateType) {
      where.templateType = TEMPLATE_TO_DB[query.templateType];
    }
    const [total, rows] = await Promise.all([
      this.prisma.client.palletProject.count({ where }),
      this.prisma.client.palletProject.findMany({
        where,
        orderBy: { updatedAt: query.sortOrder === 'asc' ? 'asc' : 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { total, items: rows.map(toListDto) };
  }

  async detail(id: string): Promise<PalletProjectDto> {
    const row = await this.prisma.client.palletProject.findFirst({
      where: { id, deletedAt: null },
      include: {
        components: {
          where: { deletedAt: null },
          orderBy: { seq: 'asc' },
        },
      },
    });
    if (!row) {
      throw problem(404, 'PALLET_NOT_FOUND', '托盘项目不存在');
    }
    return toProjectDto(row);
  }

  async listMaterials(): Promise<PalletMaterialDto[]> {
    const rows = await this.ensureMaterials();
    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      densityKgM3: row.densityKgM3,
      pricePerM3: row.pricePerM3.toFixed(2),
      fumigation: row.fumigation,
      color: row.color,
    }));
  }

  async create(input: PalletProjectInput): Promise<PalletProjectDto> {
    const materials = await this.ensureMaterials();
    this.assertValid(input, materials);
    const geometry = buildPalletGeometry(input, input.components);
    const bom = calcPalletBom(input.components, materials.map(toMaterialLike));
    const projectData = this.projectData(input, geometry.H, bom);

    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt += 1) {
      try {
        const row = await this.prisma.client.$transaction(async (tx) => {
          const code = await this.nextCode(tx);
          return tx.palletProject.create({
            data: {
              tenantId: currentTenantId(),
              code,
              ...projectData,
              components: {
                create: input.components.map((component, index) => ({
                  tenantId: currentTenantId(),
                  ...this.componentData(component, index),
                })),
              },
            },
            include: { components: true },
          });
        });
        return toProjectDto(row);
      } catch (error) {
        if (
          attempt < CODE_RETRY_LIMIT - 1 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }
    throw problem(500, 'PALLET_CODE_CONFLICT', '项目编号生成失败，请重试');
  }

  async update(id: string, input: PalletProjectInput): Promise<PalletProjectDto> {
    const materials = await this.ensureMaterials();
    this.assertValid(input, materials);
    const geometry = buildPalletGeometry(input, input.components);
    const bom = calcPalletBom(input.components, materials.map(toMaterialLike));
    const projectData = this.projectData(input, geometry.H, bom);

    await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.palletProject.updateMany({
        where: { id, deletedAt: null },
        data: projectData,
      });
      if (updated.count === 0) {
        throw problem(404, 'PALLET_NOT_FOUND', '托盘项目不存在');
      }
      await tx.palletComponent.deleteMany({ where: { projectId: id } });
      await tx.palletComponent.createMany({
        data: input.components.map((component, index) => ({
          tenantId: currentTenantId(),
          projectId: id,
          ...this.componentData(component, index),
        })),
      });
    });
    return this.detail(id);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const result = await tx.palletProject.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (result.count === 0) {
        throw problem(404, 'PALLET_NOT_FOUND', '托盘项目不存在');
      }
      await tx.palletComponent.updateMany({
        where: { projectId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });
  }

  async duplicate(id: string): Promise<PalletProjectDto> {
    const source = await this.detail(id);
    const input: PalletProjectInput = {
      name: `${source.name} 副本`,
      customerName: source.customerName,
      templateType: source.templateType as PalletTemplateType,
      destination: source.destination as PalletDestination,
      entryDirection: source.entryDirection === '2' ? '2' : '4',
      lengthMm: source.lengthMm,
      widthMm: source.widthMm,
      targetLoadKg: source.targetLoadKg,
      loadType: source.loadType as PalletLoadType,
      note: source.note,
      components: source.components.map((component) => ({
        role: component.role as PalletComponentRole,
        name: component.name,
        materialCode: component.materialCode,
        orientation: component.orientation === 'y' ? 'y' : 'x',
        lengthMm: component.lengthMm,
        widthMm: component.widthMm,
        heightMm: component.heightMm,
        quantity: component.quantity,
        wastePct: component.wastePct,
        processCost: component.processCost,
        priceOverride: component.priceOverride,
      })),
    };
    return this.create(input);
  }

  private assertValid(input: PalletProjectInput, materials: MaterialRow[]): void {
    const issues = validatePalletStructure(
      { widthMm: input.widthMm, templateType: input.templateType },
      input.components,
    );
    const errors = issues.filter((issue) => issue.level === 'error');
    if (hasPalletErrors(issues)) {
      throw problem(400, 'PALLET_COMPONENT_INVALID', errors.map((issue) => issue.message).join('；'));
    }
    const codes = new Set(materials.map((material) => material.code));
    const missing = input.components.find((component) => !codes.has(component.materialCode));
    if (missing) {
      throw problem(400, 'PALLET_COMPONENT_INVALID', `材料 ${missing.materialCode} 不存在`);
    }
  }

  private projectData(
    input: PalletProjectInput,
    totalHeightMm: number,
    bom: ReturnType<typeof calcPalletBom>,
  ) {
    return {
      name: input.name,
      customerName: input.customerName,
      templateType: TEMPLATE_TO_DB[input.templateType],
      destination: DESTINATION_TO_DB[input.destination],
      entryDirection: input.entryDirection,
      lengthMm: input.lengthMm,
      widthMm: input.widthMm,
      totalHeightMm,
      targetLoadKg: input.targetLoadKg ?? null,
      loadType: LOAD_TO_DB[input.loadType],
      totalVolumeM3: bom.netVolumeM3.toFixed(5),
      totalWeightKg: bom.weightKg.toFixed(1),
      materialCost: bom.materialCost.toFixed(2),
      processingCost: bom.processCost.toFixed(2),
      note: input.note,
    };
  }

  private componentData(component: PalletComponentInput, index: number) {
    return {
      seq: index + 1,
      role: ROLE_TO_DB[component.role],
      name: component.name,
      materialCode: component.materialCode,
      orientation: component.orientation === 'y' ? ('Y' as const) : ('X' as const),
      lengthMm: component.lengthMm,
      widthMm: component.widthMm,
      heightMm: component.heightMm,
      quantity: component.quantity,
      wastePct: component.wastePct.toFixed(4),
      processCost: component.processCost.toFixed(2),
      priceOverride: component.priceOverride.toFixed(2),
    };
  }

  private async ensureMaterials(): Promise<MaterialRow[]> {
    const existing = await this.prisma.client.palletMaterial.count({ where: { deletedAt: null } });
    if (existing === 0) {
      await this.prisma.client.palletMaterial.createMany({
        data: PALLET_DEFAULT_MATERIALS.map((material) => ({
          tenantId: currentTenantId(),
          code: material.code,
          name: material.name,
          densityKgM3: material.densityKgM3,
          pricePerM3: material.pricePerM3.toFixed(2),
          fumigation: material.fumigation,
          color: material.color,
          isSystem: true,
        })),
        skipDuplicates: true,
      });
    }
    const rows = await this.prisma.client.palletMaterial.findMany({
      where: { deletedAt: null },
    });
    const order = new Map(PALLET_DEFAULT_MATERIALS.map((material, index) => [material.code, index]));
    return rows.sort(
      (a, b) =>
        (order.get(a.code) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.code) ?? Number.MAX_SAFE_INTEGER),
    );
  }
}
