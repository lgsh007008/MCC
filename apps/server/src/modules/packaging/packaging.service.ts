import { Injectable } from '@nestjs/common';
import { Prisma } from '@mcc/db';
import {
  buildCrateGeometry,
  buildDividerGeometry,
  buildDunnageGeometry,
  buildFrameGeometry,
  buildPalletGeometry,
  calcPalletBom,
  deriveCrateOuter,
  deriveDividerOuter,
  deriveDunnageOuter,
  deriveFrameOuter,
  hasPalletErrors,
  PACKAGING_DEFAULT_TEMPLATES,
  PALLET_DEFAULT_MATERIALS,
  validateCrateStructure,
  validateDividerStructure,
  validateDunnageStructure,
  validateFrameStructure,
  validatePalletStructure,
  type PackagingListQuery,
  type PackagingPartInput,
  type PackagingProjectInput,
  type PackagingUnitInput,
  type PalletComponentInput,
  type PalletComponentRole,
  type PalletMaterialLike,
  type PalletTemplateType,
} from '@mcc/shared';
import { problem } from '../../common/http-problem.js';
import { PrismaService } from '../../common/prisma.service.js';
import { currentTenantId } from '../../common/prisma-tenant.extension.js';
import type {
  PackagingMaterialDto,
  PackagingPartDto,
  PackagingProjectDto,
  PackagingProjectListItemDto,
  PackagingProjectListDto,
  PackagingRevisionDetailDto,
  PackagingRevisionDto,
  PackagingRevisionListDto,
  PackagingTemplateDto,
  PackagingUnitDto,
} from './dto/packaging.dto.js';

// 包装设计领域（product/包装设计.md；design/包装设计.md）。
// 编号 PD + 连字符 + 5 位流水（不含日期，见 1-产品文档.md 五）；合计由服务端重算落库。
// 方案 → 单元 → 构件三层；托盘单元沿用既有几何 / BOM 纯函数。

const CODE_RETRY_LIMIT = 3;
const CODE_PREFIX = 'PD-';
const CODE_PAD = 5;

const PART_ROLE_TO_DB = {
  topDeck: 'TOP_DECK',
  endDeck: 'END_DECK',
  stringerBoard: 'STRINGER_BOARD',
  block: 'BLOCK',
  bottomDeck: 'BOTTOM_DECK',
  stringer: 'STRINGER',
  runner: 'RUNNER',
  plywood: 'PLYWOOD',
  spacer: 'SPACER',
  panel: 'PANEL',
  frame: 'FRAME',
  batten: 'BATTEN',
  steelStrap: 'STEEL_STRAP',
  dunnage: 'DUNNAGE',
  custom: 'CUSTOM',
} as const;

const PART_ROLE_FROM_DB: Record<string, PackagingPartInput['role']> = {
  TOP_DECK: 'topDeck',
  END_DECK: 'endDeck',
  STRINGER_BOARD: 'stringerBoard',
  BLOCK: 'block',
  BOTTOM_DECK: 'bottomDeck',
  STRINGER: 'stringer',
  RUNNER: 'runner',
  PLYWOOD: 'plywood',
  SPACER: 'spacer',
  PANEL: 'panel',
  FRAME: 'frame',
  BATTEN: 'batten',
  STEEL_STRAP: 'steelStrap',
  DUNNAGE: 'dunnage',
  CUSTOM: 'custom',
};

const DESTINATION_TO_DB = { export: 'EXPORT', domestic: 'DOMESTIC' } as const;
const LOAD_TO_DB = { uniform: 'UNIFORM', concentrated: 'CONCENTRATED' } as const;

type ProjectWithUnits = Prisma.PackagingProjectGetPayload<{
  include: { units: { include: { parts: true } } };
}>;
type ProjectListRow = Prisma.PackagingProjectGetPayload<{
  include: {
    units: { include: { parts: true } };
    _count: { select: { units: true } };
  };
}>;
type UnitRow = Prisma.PackagingUnitGetPayload<object>;
type PartRow = Prisma.PackagingPartGetPayload<object>;
type MaterialRow = Prisma.PackagingMaterialGetPayload<object>;
type TemplateRow = Prisma.PackagingTemplateGetPayload<object>;

const iso = (value: Date): string => value.toISOString();

const numberParam = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

const numberParamZero = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

const toMaterialLike = (row: MaterialRow): PalletMaterialLike => ({
  code: row.code,
  name: row.name,
  densityKgM3: row.densityKgM3,
  pricePerM3: Number(row.pricePerM3),
  fumigation: row.fumigation,
  color: row.color,
});

const toPalletComponents = (parts: PackagingPartInput[]): PalletComponentInput[] =>
  parts.map((part) => ({
    role: part.role as PalletComponentRole,
    name: part.name,
    materialCode: part.materialCode,
    orientation: part.orientation,
    lengthMm: part.lengthMm,
    widthMm: part.widthMm,
    heightMm: part.heightMm,
    quantity: part.quantity,
    wastePct: part.wastePct,
    processCost: part.processCost,
    priceOverride: part.priceOverride,
  }));

const toPartDto = (row: PartRow): PackagingPartDto => ({
  id: row.id,
  seq: row.seq,
  role: PART_ROLE_FROM_DB[row.role] ?? 'custom',
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

const toUnitDto = (row: UnitRow & { parts: PartRow[] }): PackagingUnitDto => ({
  id: row.id,
  seq: row.seq,
  unitType: String(row.unitType),
  templateCode: row.templateCode,
  name: row.name,
  lengthMm: row.lengthMm,
  widthMm: row.widthMm,
  totalHeightMm: row.totalHeightMm,
  targetLoadKg: row.targetLoadKg,
  loadType: row.loadType === 'CONCENTRATED' ? 'concentrated' : 'uniform',
  params: (row.params ?? {}) as Record<string, unknown>,
  totalVolumeM3: row.totalVolumeM3.toFixed(5),
  totalWeightKg: row.totalWeightKg.toFixed(1),
  materialCost: row.materialCost.toFixed(2),
  processingCost: row.processingCost.toFixed(2),
  parts: row.parts.slice().sort((a, b) => a.seq - b.seq).map(toPartDto),
});

const toProjectDto = (row: ProjectWithUnits): PackagingProjectDto => ({
  id: row.id,
  code: row.code,
  name: row.name,
  customerName: row.customerName,
  destination: row.destination === 'EXPORT' ? 'export' : 'domestic',
  status: String(row.status),
  currentRevision: row.currentRevision,
  totalVolumeM3: row.totalVolumeM3.toFixed(5),
  totalWeightKg: row.totalWeightKg.toFixed(1),
  materialCost: row.materialCost.toFixed(2),
  processingCost: row.processingCost.toFixed(2),
  note: row.note,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  units: row.units
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map(toUnitDto),
});

const toListDto = (row: ProjectListRow): PackagingProjectListItemDto => {
  const first = row.units[0];
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    customerName: row.customerName,
    unitType: first ? String(first.unitType) : 'PALLET',
    unitCount: row._count.units,
    firstUnit: first ? toUnitDto(first) : null,
    lengthMm: first?.lengthMm ?? 0,
    widthMm: first?.widthMm ?? 0,
    totalHeightMm: first?.totalHeightMm ?? 0,
    totalVolumeM3: row.totalVolumeM3.toFixed(5),
    totalWeightKg: row.totalWeightKg.toFixed(1),
    status: String(row.status),
    updatedAt: iso(row.updatedAt),
  };
};

const toRevisionDto = (row: {
  revisionNo: number;
  issuedAt: Date;
  issuedBy: string;
  note: string;
  totalVolumeM3: Prisma.Decimal;
  totalWeightKg: Prisma.Decimal;
  materialCost: Prisma.Decimal;
  processingCost: Prisma.Decimal;
}): PackagingRevisionDto => ({
  revisionNo: row.revisionNo,
  issuedAt: iso(row.issuedAt),
  issuedBy: row.issuedBy,
  note: row.note,
  totalVolumeM3: row.totalVolumeM3.toFixed(5),
  totalWeightKg: row.totalWeightKg.toFixed(1),
  materialCost: row.materialCost.toFixed(2),
  processingCost: row.processingCost.toFixed(2),
});

interface UnitCalc {
  totalHeightMm: number;
  netVolumeM3: number;
  weightKg: number;
  materialCost: number;
  processCost: number;
}

@Injectable()
export class PackagingService {
  constructor(private readonly prisma: PrismaService) {}

  // 编号：事务内取 PD- 前缀最大流水 +1；唯一约束兜底并发，P2002 重试。
  private nextCode(tx: Prisma.TransactionClient): Promise<string> {
    return tx.packagingProject
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

  async list(query: PackagingListQuery): Promise<PackagingProjectListDto> {
    const where: Prisma.PackagingProjectWhereInput = { deletedAt: null };
    if (query.keyword) {
      where.OR = [
        { code: { contains: query.keyword } },
        { name: { contains: query.keyword } },
        { customerName: { contains: query.keyword } },
      ];
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.unitType) {
      where.units = { some: { unitType: query.unitType } };
    }
    const [total, rows] = await Promise.all([
      this.prisma.client.packagingProject.count({ where }),
      this.prisma.client.packagingProject.findMany({
        where,
        orderBy: { updatedAt: query.sortOrder === 'asc' ? 'asc' : 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          units: {
            orderBy: { seq: 'asc' },
            take: 1,
            include: {
              parts: { where: { deletedAt: null }, orderBy: { seq: 'asc' } },
            },
          },
          _count: { select: { units: true } },
        },
      }),
    ]);
    return { total, items: rows.map(toListDto) };
  }

  async detail(id: string): Promise<PackagingProjectDto> {
    const row = await this.prisma.client.packagingProject.findFirst({
      where: { id, deletedAt: null },
      include: {
        units: {
          where: { deletedAt: null },
          orderBy: { seq: 'asc' },
          include: {
            parts: {
              where: { deletedAt: null },
              orderBy: { seq: 'asc' },
            },
          },
        },
      },
    });
    if (!row) {
      throw problem(404, 'PACKAGING_NOT_FOUND', '包装方案不存在');
    }
    return toProjectDto(row);
  }

  async listMaterials(): Promise<PackagingMaterialDto[]> {
    const rows = await this.ensureMaterials();
    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      densityKgM3: row.densityKgM3,
      pricePerM3: row.pricePerM3.toFixed(2),
      fumigation: row.fumigation,
      color: row.color,
      applicableUnitTypes: row.applicableUnitTypes,
    }));
  }

  async listTemplates(unitType?: string): Promise<PackagingTemplateDto[]> {
    const rows = await this.ensureTemplates(unitType);
    return rows.map((row) => ({
      code: row.code,
      unitType: String(row.unitType),
      name: row.name,
      schemaVersion: row.schemaVersion,
      definition: (row.definition ?? {}) as Record<string, unknown>,
    }));
  }

  async create(input: PackagingProjectInput): Promise<PackagingProjectDto> {
    const materials = await this.ensureMaterials();
    await this.ensureTemplates();
    const calcs = input.units.map((unit) => this.calcUnit(unit, materials));
    const totals = calcs.reduce(
      (acc, calc) => ({
        totalVolumeM3: acc.totalVolumeM3 + calc.netVolumeM3,
        totalWeightKg: acc.totalWeightKg + calc.weightKg,
        materialCost: acc.materialCost + calc.materialCost,
        processingCost: acc.processingCost + calc.processCost,
      }),
      { totalVolumeM3: 0, totalWeightKg: 0, materialCost: 0, processingCost: 0 },
    );

    for (let attempt = 0; attempt < CODE_RETRY_LIMIT; attempt += 1) {
      try {
        const row = await this.prisma.client.$transaction(async (tx) => {
          const code = await this.nextCode(tx);
          return tx.packagingProject.create({
            data: {
              tenantId: currentTenantId(),
              code,
              name: input.name,
              customerName: input.customerName,
              destination: DESTINATION_TO_DB[input.destination],
              note: input.note,
              totalVolumeM3: totals.totalVolumeM3.toFixed(5),
              totalWeightKg: totals.totalWeightKg.toFixed(1),
              materialCost: totals.materialCost.toFixed(2),
              processingCost: totals.processingCost.toFixed(2),
              units: {
                create: input.units.map((unit, unitIndex) => ({
                  tenantId: currentTenantId(),
                  seq: unitIndex + 1,
                  unitType: unit.unitType,
                  templateCode: unit.templateCode,
                  name: unit.name,
                  lengthMm: unit.lengthMm,
                  widthMm: unit.widthMm,
                  totalHeightMm: calcs[unitIndex]!.totalHeightMm,
                  targetLoadKg: unit.targetLoadKg ?? null,
                  loadType: LOAD_TO_DB[unit.loadType],
                  params: unit.params as Prisma.InputJsonValue,
                  totalVolumeM3: calcs[unitIndex]!.netVolumeM3.toFixed(5),
                  totalWeightKg: calcs[unitIndex]!.weightKg.toFixed(1),
                  materialCost: calcs[unitIndex]!.materialCost.toFixed(2),
                  processingCost: calcs[unitIndex]!.processCost.toFixed(2),
                  parts: {
                    create: unit.parts.map((part, partIndex) => ({
                      tenantId: currentTenantId(),
                      seq: partIndex + 1,
                      role: PART_ROLE_TO_DB[part.role],
                      name: part.name,
                      materialCode: part.materialCode,
                      orientation: part.orientation === 'y' ? ('Y' as const) : ('X' as const),
                      lengthMm: part.lengthMm,
                      widthMm: part.widthMm,
                      heightMm: part.heightMm,
                      quantity: part.quantity,
                      wastePct: part.wastePct.toFixed(4),
                      processCost: part.processCost.toFixed(2),
                      priceOverride: part.priceOverride.toFixed(2),
                    })),
                  },
                })),
              },
            },
            include: {
              units: { include: { parts: true } },
            },
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
    throw problem(500, 'PACKAGING_CODE_CONFLICT', '方案编号生成失败，请重试');
  }

  async update(id: string, input: PackagingProjectInput): Promise<PackagingProjectDto> {
    const existing = await this.prisma.client.packagingProject.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw problem(404, 'PACKAGING_NOT_FOUND', '包装方案不存在');
    }
    if (existing.status === 'ISSUED') {
      throw problem(409, 'PACKAGING_REVISION_LOCKED', '方案已发布，请新建下一版本后再修改');
    }

    const materials = await this.ensureMaterials();
    await this.ensureTemplates();
    const calcs = input.units.map((unit) => this.calcUnit(unit, materials));
    const totals = calcs.reduce(
      (acc, calc) => ({
        totalVolumeM3: acc.totalVolumeM3 + calc.netVolumeM3,
        totalWeightKg: acc.totalWeightKg + calc.weightKg,
        materialCost: acc.materialCost + calc.materialCost,
        processingCost: acc.processingCost + calc.processCost,
      }),
      { totalVolumeM3: 0, totalWeightKg: 0, materialCost: 0, processingCost: 0 },
    );

    await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.packagingProject.updateMany({
        where: { id, deletedAt: null },
        data: {
          name: input.name,
          customerName: input.customerName,
          destination: DESTINATION_TO_DB[input.destination],
          note: input.note,
          totalVolumeM3: totals.totalVolumeM3.toFixed(5),
          totalWeightKg: totals.totalWeightKg.toFixed(1),
          materialCost: totals.materialCost.toFixed(2),
          processingCost: totals.processingCost.toFixed(2),
        },
      });
      if (updated.count === 0) {
        throw problem(404, 'PACKAGING_NOT_FOUND', '包装方案不存在');
      }
      await tx.packagingUnit.deleteMany({ where: { projectId: id } });
      for (const [unitIndex, unit] of input.units.entries()) {
        await tx.packagingUnit.create({
          data: {
            tenantId: currentTenantId(),
            projectId: id,
            seq: unitIndex + 1,
            unitType: unit.unitType,
            templateCode: unit.templateCode,
            name: unit.name,
            lengthMm: unit.lengthMm,
            widthMm: unit.widthMm,
            totalHeightMm: calcs[unitIndex]!.totalHeightMm,
            targetLoadKg: unit.targetLoadKg ?? null,
            loadType: LOAD_TO_DB[unit.loadType],
            params: unit.params as Prisma.InputJsonValue,
            totalVolumeM3: calcs[unitIndex]!.netVolumeM3.toFixed(5),
            totalWeightKg: calcs[unitIndex]!.weightKg.toFixed(1),
            materialCost: calcs[unitIndex]!.materialCost.toFixed(2),
            processingCost: calcs[unitIndex]!.processCost.toFixed(2),
            parts: {
              create: unit.parts.map((part, partIndex) => ({
                tenantId: currentTenantId(),
                seq: partIndex + 1,
                role: PART_ROLE_TO_DB[part.role],
                name: part.name,
                materialCode: part.materialCode,
                orientation: part.orientation === 'y' ? ('Y' as const) : ('X' as const),
                lengthMm: part.lengthMm,
                widthMm: part.widthMm,
                heightMm: part.heightMm,
                quantity: part.quantity,
                wastePct: part.wastePct.toFixed(4),
                processCost: part.processCost.toFixed(2),
                priceOverride: part.priceOverride.toFixed(2),
              })),
            },
          },
        });
      }
    });
    return this.detail(id);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const result = await tx.packagingProject.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (result.count === 0) {
        throw problem(404, 'PACKAGING_NOT_FOUND', '包装方案不存在');
      }
      await tx.packagingUnit.updateMany({
        where: { projectId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await tx.packagingPart.updateMany({
        where: { unit: { projectId: id }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });
  }

  async duplicate(id: string): Promise<PackagingProjectDto> {
    const source = await this.detail(id);
    const input: PackagingProjectInput = {
      name: `${source.name} 副本`,
      customerName: source.customerName,
      destination: source.destination as 'export' | 'domestic',
      note: source.note,
      units: source.units.map((unit) => ({
        unitType: unit.unitType as PackagingUnitInput['unitType'],
        templateCode: unit.templateCode,
        name: unit.name,
        lengthMm: unit.lengthMm,
        widthMm: unit.widthMm,
        targetLoadKg: unit.targetLoadKg,
        loadType: unit.loadType as 'uniform' | 'concentrated',
        params: unit.params,
        parts: unit.parts.map((part) => ({
          role: part.role as PackagingPartInput['role'],
          name: part.name,
          materialCode: part.materialCode,
          orientation: part.orientation === 'y' ? 'y' : 'x',
          lengthMm: part.lengthMm,
          widthMm: part.widthMm,
          heightMm: part.heightMm,
          quantity: part.quantity,
          wastePct: part.wastePct,
          processCost: part.processCost,
          priceOverride: part.priceOverride,
        })),
      })),
    };
    return this.create(input);
  }

  async nextRevision(id: string): Promise<PackagingProjectDto> {
    const existing = await this.prisma.client.packagingProject.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw problem(404, 'PACKAGING_NOT_FOUND', '包装方案不存在');
    }
    if (existing.status !== 'ISSUED') {
      throw problem(409, 'PACKAGING_REVISION_LOCKED', '只有已发布方案可以新建下一版本');
    }
    await this.prisma.client.packagingProject.updateMany({
      where: { id, deletedAt: null },
      data: { status: 'DRAFT' },
    });
    return this.detail(id);
  }

  async issue(id: string, issuedBy: string, note = ''): Promise<PackagingRevisionDto> {
    const project = await this.detail(id);
    if (project.status === 'ISSUED') {
      throw problem(409, 'PACKAGING_REVISION_LOCKED', '方案已发布，请新建下一版本后再发布');
    }
    const revisionNo = project.currentRevision + 1;
    const snapshot = {
      project: {
        code: project.code,
        name: project.name,
        customerName: project.customerName,
        destination: project.destination,
        note: project.note,
      },
      units: project.units,
      totals: {
        totalVolumeM3: project.totalVolumeM3,
        totalWeightKg: project.totalWeightKg,
        materialCost: project.materialCost,
        processingCost: project.processingCost,
      },
      issuedAt: new Date().toISOString(),
      issuedBy,
    };
    const row = await this.prisma.client.$transaction(async (tx) => {
      const revision = await tx.packagingRevision.create({
        data: {
          tenantId: currentTenantId(),
          projectId: id,
          revisionNo,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          note,
          issuedBy,
          totalVolumeM3: project.totalVolumeM3,
          totalWeightKg: project.totalWeightKg,
          materialCost: project.materialCost,
          processingCost: project.processingCost,
        },
      });
      await tx.packagingProject.updateMany({
        where: { id, deletedAt: null },
        data: { status: 'ISSUED', currentRevision: revisionNo },
      });
      return revision;
    });
    return toRevisionDto(row);
  }

  async listRevisions(id: string): Promise<PackagingRevisionListDto> {
    const rows = await this.prisma.client.packagingRevision.findMany({
      where: { projectId: id },
      orderBy: { revisionNo: 'desc' },
    });
    return { total: rows.length, items: rows.map(toRevisionDto) };
  }

  async revisionDetail(id: string, revisionNo: number): Promise<PackagingRevisionDetailDto> {
    const row = await this.prisma.client.packagingRevision.findFirst({
      where: { projectId: id, revisionNo },
    });
    if (!row) {
      throw problem(404, 'PACKAGING_NOT_FOUND', '版本不存在');
    }
    return {
      ...toRevisionDto(row),
      snapshot: (row.snapshot ?? {}) as Record<string, unknown>,
    };
  }

  private calcUnit(unit: PackagingUnitInput, materials: MaterialRow[]): UnitCalc {
    if (
      unit.unitType !== 'PALLET' &&
      unit.unitType !== 'CRATE' &&
      unit.unitType !== 'SKID' &&
      unit.unitType !== 'FRAME' &&
      unit.unitType !== 'DIVIDER' &&
      unit.unitType !== 'DUNNAGE' &&
      unit.unitType !== 'STEEL_STRAP'
    ) {
      throw problem(
        400,
        'PACKAGING_UNIT_TYPE_NOT_READY',
        `${unit.unitType} 单元尚未开放设计，当前支持托盘、普通木箱、滑木箱、框架箱、围板、垫木与钢带箱`,
      );
    }
    const components = toPalletComponents(unit.parts);
    const materialCodes = new Set(materials.map((material) => material.code));
    const missing = unit.parts.find((part) => !materialCodes.has(part.materialCode));
    if (missing) {
      throw problem(400, 'PACKAGING_COMPONENT_INVALID', `材料 ${missing.materialCode} 不存在`);
    }

    if (unit.unitType === 'DUNNAGE') {
      const params = {
        lengthMm: numberParam(unit.params.lengthMm, unit.lengthMm),
        widthMm: numberParam(unit.params.widthMm, unit.widthMm),
        thicknessMm: numberParam(unit.params.thicknessMm, 90),
        quantity: Math.max(1, Math.min(20, numberParamZero(unit.params.quantity, 3))),
        arrangement:
          unit.params.arrangement === 'cross' ? ('cross' as const) : ('parallel' as const),
      };
      const issues = validateDunnageStructure(components, {
        quantity: params.quantity,
        arrangement: params.arrangement,
      });
      const errors = issues.filter((issue) => issue.level === 'error');
      if (errors.length > 0) {
        throw problem(400, 'PACKAGING_COMPONENT_INVALID', errors.map((issue) => issue.message).join('；'));
      }
      const expected = deriveDunnageOuter(params);
      const geometry = buildDunnageGeometry(
        {
          outerLengthMm: unit.lengthMm,
          outerWidthMm: unit.widthMm,
          outerHeightMm: expected.heightMm,
          arrangement: params.arrangement,
        },
        components,
      );
      const bom = calcPalletBom(components, materials.map(toMaterialLike));
      return {
        totalHeightMm: geometry.H,
        netVolumeM3: bom.netVolumeM3,
        weightKg: bom.weightKg,
        materialCost: bom.materialCost,
        processCost: bom.processCost,
      };
    }

    if (unit.unitType === 'DIVIDER') {
      const innerLengthMm = numberParam(unit.params.innerLengthMm, unit.lengthMm);
      const innerWidthMm = numberParam(unit.params.innerWidthMm, unit.widthMm);
      const layerHeightMm = numberParam(unit.params.layerHeightMm, 200);
      const layerCount = Math.max(1, Math.min(3, numberParamZero(unit.params.layerCount, 1)));
      const thicknessMm = numberParam(unit.params.thicknessMm, 8);
      const lapWidthMm = numberParamZero(unit.params.lapWidthMm, 30);
      const issues = validateDividerStructure(components, {
        layerCount,
        lapWidthMm,
        innerLengthMm,
        innerWidthMm,
      });
      const errors = issues.filter((issue) => issue.level === 'error');
      if (errors.length > 0) {
        throw problem(400, 'PACKAGING_COMPONENT_INVALID', errors.map((issue) => issue.message).join('；'));
      }
      const expected = deriveDividerOuter({
        innerLengthMm,
        innerWidthMm,
        layerHeightMm,
        layerCount,
        thicknessMm,
        lapWidthMm,
        hingeCount: numberParamZero(unit.params.hingeCount, 4),
      });
      if (unit.lengthMm < expected.lengthMm || unit.widthMm < expected.widthMm) {
        throw problem(
          400,
          'PACKAGING_COMPONENT_INVALID',
          '围板外尺寸不得小于内尺寸加两侧板厚',
        );
      }
      const geometry = buildDividerGeometry(
        {
          outerLengthMm: unit.lengthMm,
          outerWidthMm: unit.widthMm,
          layerHeightMm,
          layerCount,
          thicknessMm,
        },
        components,
      );
      const bom = calcPalletBom(components, materials.map(toMaterialLike));
      return {
        totalHeightMm: geometry.H,
        netVolumeM3: bom.netVolumeM3,
        weightKg: bom.weightKg,
        materialCost: bom.materialCost,
        processCost: bom.processCost,
      };
    }

    if (unit.unitType === 'FRAME') {
      const panelCoverage: 'none' | 'sides' | 'full' =
        unit.params.panelCoverage === 'sides' || unit.params.panelCoverage === 'full'
          ? unit.params.panelCoverage
          : 'none';
      const hasLid = unit.params.hasLid !== false;
      const issues = validateFrameStructure(components, { panelCoverage, hasLid });
      const errors = issues.filter((issue) => issue.level === 'error');
      if (errors.length > 0) {
        throw problem(400, 'PACKAGING_COMPONENT_INVALID', errors.map((issue) => issue.message).join('；'));
      }
      const innerLengthMm = numberParam(unit.params.innerLengthMm, unit.lengthMm);
      const innerWidthMm = numberParam(unit.params.innerWidthMm, unit.widthMm);
      const innerHeightMm = numberParam(unit.params.innerHeightMm, 900);
      const frameThicknessMm = numberParam(unit.params.frameThicknessMm, 90);
      const bottomThicknessMm = numberParam(unit.params.bottomThicknessMm, 15);
      const baseHeightMm = numberParam(unit.params.baseHeightMm, 90);
      const panelThicknessMm = numberParamZero(unit.params.panelThicknessMm, 15);
      const params = {
        innerLengthMm,
        innerWidthMm,
        innerHeightMm,
        frameThicknessMm,
        bottomThicknessMm,
        baseHeightMm,
        panelThicknessMm,
        panelCoverage,
        hasLid,
        steelStrapCount: numberParamZero(unit.params.steelStrapCount, 0),
      };
      const expected = deriveFrameOuter(params);
      if (unit.lengthMm < expected.lengthMm || unit.widthMm < expected.widthMm) {
        throw problem(
          400,
          'PACKAGING_COMPONENT_INVALID',
          '框架箱外尺寸不得小于内尺寸加两侧框架厚度与面板厚',
        );
      }
      const geometry = buildFrameGeometry(
        {
          outerLengthMm: unit.lengthMm,
          outerWidthMm: unit.widthMm,
          innerHeightMm,
          frameThicknessMm,
          bottomThicknessMm,
          baseHeightMm,
          outerHeightMm: expected.heightMm,
        },
        components,
      );
      const bom = calcPalletBom(components, materials.map(toMaterialLike));
      return {
        totalHeightMm: geometry.H,
        netVolumeM3: bom.netVolumeM3,
        weightKg: bom.weightKg,
        materialCost: bom.materialCost,
        processCost: bom.processCost,
      };
    }

    if (unit.unitType !== 'PALLET') {
      const issues = validateCrateStructure(components);
      const errors = issues.filter((issue) => issue.level === 'error');
      if (errors.length > 0) {
        throw problem(400, 'PACKAGING_COMPONENT_INVALID', errors.map((issue) => issue.message).join('；'));
      }
      const innerLengthMm = numberParam(unit.params.innerLengthMm, unit.lengthMm);
      const innerWidthMm = numberParam(unit.params.innerWidthMm, unit.widthMm);
      const innerHeightMm = numberParam(unit.params.innerHeightMm, 900);
      const thicknessMm = numberParam(unit.params.thicknessMm, 15);
      const params = {
        innerLengthMm,
        innerWidthMm,
        innerHeightMm,
        thicknessMm,
        bottomThicknessMm: numberParam(unit.params.bottomThicknessMm, thicknessMm),
        baseHeightMm: numberParam(unit.params.baseHeightMm, 90),
        frameThicknessMm: numberParamZero(unit.params.frameThicknessMm, 90),
      };
      const expected = deriveCrateOuter(params);
      if (unit.lengthMm < expected.lengthMm || unit.widthMm < expected.widthMm) {
        throw problem(
          400,
          'PACKAGING_COMPONENT_INVALID',
          '木箱外尺寸不得小于内尺寸加两侧面板厚与框架厚度',
        );
      }
      const geometry = buildCrateGeometry(
        {
          outerLengthMm: unit.lengthMm,
          outerWidthMm: unit.widthMm,
          innerHeightMm,
          thicknessMm,
          bottomThicknessMm: params.bottomThicknessMm,
          baseHeightMm: params.baseHeightMm,
          frameThicknessMm: params.frameThicknessMm,
        },
        components,
      );
      const bom = calcPalletBom(components, materials.map(toMaterialLike));
      return {
        totalHeightMm: geometry.H,
        netVolumeM3: bom.netVolumeM3,
        weightKg: bom.weightKg,
        materialCost: bom.materialCost,
        processCost: bom.processCost,
      };
    }

    const palletInput = { lengthMm: unit.lengthMm, widthMm: unit.widthMm };
    const issues = validatePalletStructure(
      { widthMm: unit.widthMm, templateType: unit.templateCode as PalletTemplateType },
      components,
    );
    const errors = issues.filter((issue) => issue.level === 'error');
    if (hasPalletErrors(issues)) {
      throw problem(400, 'PACKAGING_COMPONENT_INVALID', errors.map((issue) => issue.message).join('；'));
    }
    const geometry = buildPalletGeometry(
      { ...palletInput, templateType: unit.templateCode as PalletTemplateType },
      components,
    );
    const bom = calcPalletBom(components, materials.map(toMaterialLike));
    return {
      totalHeightMm: geometry.H,
      netVolumeM3: bom.netVolumeM3,
      weightKg: bom.weightKg,
      materialCost: bom.materialCost,
      processCost: bom.processCost,
    };
  }

  private async ensureMaterials(): Promise<MaterialRow[]> {
    // 预置材料按 code 幂等补齐：新增默认材料（如钢带）自动进入已有租户，不覆盖平台改价。
    await this.prisma.client.packagingMaterial.createMany({
      data: PALLET_DEFAULT_MATERIALS.map((material) => ({
        tenantId: currentTenantId(),
        code: material.code,
        name: material.name,
        densityKgM3: material.densityKgM3,
        pricePerM3: material.pricePerM3.toFixed(2),
        fumigation: material.fumigation,
        color: material.color,
        applicableUnitTypes: [],
        isSystem: true,
      })),
      skipDuplicates: true,
    });
    const rows = await this.prisma.client.packagingMaterial.findMany({
      where: { deletedAt: null },
    });
    const order = new Map(PALLET_DEFAULT_MATERIALS.map((material, index) => [material.code, index]));
    return rows.sort(
      (a, b) =>
        (order.get(a.code) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.code) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  private async ensureTemplates(unitType?: string): Promise<TemplateRow[]> {
    // 系统模板按 code 幂等刷新，保证模板定义升级后所有租户读取到最新版本；租户自定义模板不动。
    for (const template of PACKAGING_DEFAULT_TEMPLATES) {
      const updated = await this.prisma.client.packagingTemplate.updateMany({
        where: { code: template.code, isSystem: true },
        data: {
          unitType: template.unitType,
          name: template.name,
          schemaVersion: 1,
          definition: template.definition as Prisma.InputJsonValue,
          active: true,
        },
      });
      if (updated.count === 0) {
        await this.prisma.client.packagingTemplate
          .create({
            data: {
              tenantId: currentTenantId(),
              code: template.code,
              unitType: template.unitType,
              name: template.name,
              schemaVersion: 1,
              definition: template.definition as Prisma.InputJsonValue,
              isSystem: true,
              active: true,
            },
          })
          .catch((error: unknown) => {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'
            ) {
              return;
            }
            throw error;
          });
      }
    }
    return this.prisma.client.packagingTemplate.findMany({
      where: {
        deletedAt: null,
        active: true,
        ...(unitType ? { unitType: unitType as never } : {}),
      },
      orderBy: [{ unitType: 'asc' }, { code: 'asc' }],
    });
  }
}
