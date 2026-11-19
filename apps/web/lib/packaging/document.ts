import {
  applyPalletDeckCounts,
  clampPalletDeckCount,
  CRATE_DEFAULT_PARAMS,
  deriveCrateOuter,
  deriveCrateParts,
  deriveDividerOuter,
  deriveDividerParts,
  deriveDunnageOuter,
  deriveDunnageParts,
  deriveFrameOuter,
  deriveFrameParts,
  DIVIDER_DEFAULT_PARAMS,
  DUNNAGE_DEFAULT_PARAMS,
  FRAME_DEFAULT_PARAMS,
  palletDeckDefaults,
  palletTemplateComponents,
  PALLET_TEMPLATE_OPTIONS,
  validateCrateStructure,
  validateDividerStructure,
  validateDunnageStructure,
  validateFrameStructure,
  validatePalletStructure,
  type ApiSchemas,
  type DunnageArrangement,
  type FramePanelCoverage,
  type PackagingDestination,
  type PackagingLoadType,
  type PackagingPartInput,
  type PalletComponentInput,
  type PalletComponentRole,
  type PalletDeckMode,
  type PalletEntryDirection,
  type PalletTemplateType,
} from '@mcc/shared';
import { randomUuid } from '../uuid';

// 包装设计工作台的文档状态（design/包装设计.md §9）：
// 纯函数 + reducer，供工作台、撤销/重做与本地草稿共用。

type PackagingProjectDto = ApiSchemas['PackagingProjectDto'];

export interface ProjectState {
  name: string;
  customerName: string;
  destination: PackagingDestination;
  note: string;
}

export interface UnitDraft {
  key: string;
  unitType: 'PALLET' | 'CRATE' | 'SKID' | 'FRAME' | 'DIVIDER' | 'DUNNAGE' | 'STEEL_STRAP';
  templateCode: string;
  name: string;
  lengthMm: number;
  widthMm: number;
  targetLoadKg: number | null;
  loadType: PackagingLoadType;
  entryDirection: PalletEntryDirection;
  innerLengthMm: number;
  innerWidthMm: number;
  innerHeightMm: number;
  /** 木箱面板厚（侧板 / 端板 / 盖板） */
  thicknessMm: number;
  /** 木箱底板厚 */
  bottomThicknessMm: number;
  /** 木箱底部支承高度 */
  baseHeightMm: number;
  /** 木箱框架厚度 */
  frameThicknessMm: number;
  /** 木箱钢带道数；0 表示不配 */
  steelStrapCount: number;
  /** 滑木数量（滑木箱） */
  runnerCount: number;
  /** 滑木宽度（滑木箱） */
  runnerWidthMm: number;
  /** 钢带宽度 */
  strapWidthMm: number;
  /** 钢带方向 */
  strapDirection: 'horizontal' | 'both';
  /** 框架箱面板厚；0 表示无面板 */
  panelThicknessMm: number;
  /** 框架箱面板覆盖：无 / 侧端 / 全包 */
  panelCoverage: FramePanelCoverage;
  /** 框架箱盖板开关 */
  hasLid: boolean;
  /** 围板单层高度 */
  layerHeightMm: number;
  /** 围板层数 1–3 */
  layerCount: number;
  /** 围板搭接宽度 */
  lapWidthMm: number;
  /** 围板每层铰链数量 */
  hingeCount: number;
  /** 垫木单根长度 */
  dunnageLengthMm: number;
  /** 垫木单根宽度 */
  dunnageWidthMm: number;
  /** 垫木单根厚度 */
  dunnageThicknessMm: number;
  /** 垫木数量 */
  dunnageQuantity: number;
  /** 垫木排列 */
  dunnageArrangement: DunnageArrangement;
  /** 托盘上铺板：自动跟随模板 / 手动覆盖 */
  topDeckMode: PalletDeckMode;
  topDeckCount: number | null;
  /** 托盘下铺板：自动跟随模板 / 手动覆盖 */
  bottomDeckMode: PalletDeckMode;
  bottomDeckCount: number | null;
  parts: PalletComponentInput[];
}

export interface PackagingDocument {
  project: ProjectState;
  units: UnitDraft[];
}

export const defaultProject: ProjectState = {
  name: '',
  customerName: '',
  destination: 'export',
  note: '',
};

const CRATE_TEMPLATE_CODE = 'crate-g';
const SKID_TEMPLATE_CODE = 'skid-g';
const STEEL_STRAP_TEMPLATE_CODE = 'steel-strap-g';
const FRAME_TEMPLATE_CODE = 'frame-g';
const DIVIDER_TEMPLATE_CODE = 'divider-g';
const DUNNAGE_TEMPLATE_CODE = 'dunnage-g';

const isCrateLike = (unitType: UnitDraft['unitType']): boolean =>
  unitType === 'CRATE' || unitType === 'SKID' || unitType === 'STEEL_STRAP';

const isFrame = (unitType: UnitDraft['unitType']): boolean => unitType === 'FRAME';

const isDivider = (unitType: UnitDraft['unitType']): boolean => unitType === 'DIVIDER';

const isDunnage = (unitType: UnitDraft['unitType']): boolean => unitType === 'DUNNAGE';

const toComponents = (items: PackagingProjectDto['units'][number]['parts']): PalletComponentInput[] =>
  items.map((item) => ({
    role: item.role as PalletComponentRole,
    name: item.name,
    materialCode: item.materialCode,
    orientation: item.orientation === 'y' ? 'y' : 'x',
    lengthMm: item.lengthMm,
    widthMm: item.widthMm,
    heightMm: item.heightMm,
    quantity: item.quantity,
    wastePct: item.wastePct,
    processCost: item.processCost,
    priceOverride: item.priceOverride,
  }));

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

const numberOrZero = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : fallback;

const numberInRange = (value: unknown, fallback: number, min: number, max: number): number =>
  Math.max(
    min,
    Math.min(
      max,
      Math.round(typeof value === 'number' && Number.isFinite(value) ? value : fallback),
    ),
  );

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const crateParamsOf = (unit: UnitDraft): {
  innerLengthMm: number;
  innerWidthMm: number;
  innerHeightMm: number;
  thicknessMm: number;
  bottomThicknessMm: number;
  baseHeightMm: number;
  frameThicknessMm: number;
  steelStrapCount: number;
  runnerCount: number;
  runnerWidthMm: number;
  strapWidthMm: number;
  strapDirection: 'horizontal' | 'both';
} => ({
  innerLengthMm: unit.innerLengthMm,
  innerWidthMm: unit.innerWidthMm,
  innerHeightMm: unit.innerHeightMm,
  thicknessMm: unit.thicknessMm,
  bottomThicknessMm: unit.bottomThicknessMm,
  baseHeightMm: unit.baseHeightMm,
  frameThicknessMm: unit.frameThicknessMm,
  steelStrapCount: unit.steelStrapCount,
  runnerCount: unit.runnerCount,
  runnerWidthMm: unit.runnerWidthMm,
  strapWidthMm: unit.strapWidthMm,
  strapDirection: unit.strapDirection,
});

const applyCrateParamsToUnit = (
  unit: UnitDraft,
  patch: Partial<
    Pick<
      UnitDraft,
      | 'innerLengthMm'
      | 'innerWidthMm'
      | 'innerHeightMm'
      | 'thicknessMm'
      | 'bottomThicknessMm'
      | 'baseHeightMm'
      | 'frameThicknessMm'
      | 'steelStrapCount'
      | 'runnerCount'
      | 'runnerWidthMm'
      | 'strapWidthMm'
      | 'strapDirection'
    >
  >,
): UnitDraft => {
  const next = { ...unit, ...patch };
  const params = {
    ...crateParamsOf(next),
    /*
     * 面板厚同时作为盖板厚；底板厚缺省时随面板厚，避免旧草稿出现 0。
     */
    bottomThicknessMm: next.bottomThicknessMm || next.thicknessMm,
  };
  const outer = deriveCrateOuter(params);
  return {
    ...next,
    ...params,
    lengthMm: outer.lengthMm,
    widthMm: outer.widthMm,
    parts: mergePartOverrides(deriveCrateParts(params), unit.parts),
  };
};

export const frameParamsOf = (unit: UnitDraft): {
  innerLengthMm: number;
  innerWidthMm: number;
  innerHeightMm: number;
  frameThicknessMm: number;
  bottomThicknessMm: number;
  baseHeightMm: number;
  runnerWidthMm: number;
  panelThicknessMm: number;
  panelCoverage: FramePanelCoverage;
  hasLid: boolean;
  steelStrapCount: number;
} => ({
  innerLengthMm: unit.innerLengthMm,
  innerWidthMm: unit.innerWidthMm,
  innerHeightMm: unit.innerHeightMm,
  frameThicknessMm: unit.frameThicknessMm,
  bottomThicknessMm: unit.bottomThicknessMm,
  baseHeightMm: unit.baseHeightMm,
  runnerWidthMm: unit.runnerWidthMm,
  panelThicknessMm: unit.panelThicknessMm,
  panelCoverage: unit.panelCoverage,
  hasLid: unit.hasLid,
  steelStrapCount: unit.steelStrapCount,
});

const applyFrameParamsToUnit = (
  unit: UnitDraft,
  patch: Partial<
    Pick<
      UnitDraft,
      | 'innerLengthMm'
      | 'innerWidthMm'
      | 'innerHeightMm'
      | 'frameThicknessMm'
      | 'bottomThicknessMm'
      | 'baseHeightMm'
      | 'runnerWidthMm'
      | 'panelThicknessMm'
      | 'panelCoverage'
      | 'hasLid'
      | 'steelStrapCount'
    >
  >,
): UnitDraft => {
  const next = { ...unit, ...patch };
  const params = frameParamsOf(next);
  const outer = deriveFrameOuter(params);
  return {
    ...next,
    lengthMm: outer.lengthMm,
    widthMm: outer.widthMm,
    parts: mergePartOverrides(deriveFrameParts(params), unit.parts),
  };
};

export const dividerParamsOf = (unit: UnitDraft): {
  innerLengthMm: number;
  innerWidthMm: number;
  layerHeightMm: number;
  layerCount: number;
  thicknessMm: number;
  lapWidthMm: number;
  hingeCount: number;
} => ({
  innerLengthMm: unit.innerLengthMm,
  innerWidthMm: unit.innerWidthMm,
  layerHeightMm: unit.layerHeightMm,
  layerCount: unit.layerCount,
  thicknessMm: unit.thicknessMm,
  lapWidthMm: unit.lapWidthMm,
  hingeCount: unit.hingeCount,
});

const applyDividerParamsToUnit = (
  unit: UnitDraft,
  patch: Partial<
    Pick<
      UnitDraft,
      | 'innerLengthMm'
      | 'innerWidthMm'
      | 'layerHeightMm'
      | 'layerCount'
      | 'thicknessMm'
      | 'lapWidthMm'
      | 'hingeCount'
    >
  >,
): UnitDraft => {
  const next = { ...unit, ...patch };
  const params = dividerParamsOf(next);
  const outer = deriveDividerOuter(params);
  return {
    ...next,
    lengthMm: outer.lengthMm,
    widthMm: outer.widthMm,
    parts: mergePartOverrides(deriveDividerParts(params), unit.parts),
  };
};

export const dunnageParamsOf = (unit: UnitDraft): {
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  quantity: number;
  arrangement: DunnageArrangement;
} => ({
  lengthMm: unit.dunnageLengthMm,
  widthMm: unit.dunnageWidthMm,
  thicknessMm: unit.dunnageThicknessMm,
  quantity: unit.dunnageQuantity,
  arrangement: unit.dunnageArrangement,
});

const applyDunnageParamsToUnit = (
  unit: UnitDraft,
  patch: Partial<
    Pick<
      UnitDraft,
      | 'dunnageLengthMm'
      | 'dunnageWidthMm'
      | 'dunnageThicknessMm'
      | 'dunnageQuantity'
      | 'dunnageArrangement'
    >
  >,
): UnitDraft => {
  const next = { ...unit, ...patch };
  const params = dunnageParamsOf(next);
  const outer = deriveDunnageOuter(params);
  return {
    ...next,
    lengthMm: outer.lengthMm,
    widthMm: outer.widthMm,
    parts: deriveDunnageParts(params),
  };
};

/**
 * 参数重算时保留手工覆盖的材料 / 损耗 / 费用；尺寸与数量回到派生值。
 * 结构变更（模板切换）不走本函数，避免把旧结构的覆盖带到新结构。
 */
const mergePartOverrides = (
  derived: PalletComponentInput[],
  previous: PalletComponentInput[],
): PalletComponentInput[] =>
  derived.map((part) => {
    const match = previous.find(
      (item) => item.role === part.role && item.name === part.name,
    );
    return match
      ? {
          ...part,
          materialCode: match.materialCode,
          wastePct: match.wastePct,
          processCost: match.processCost,
          priceOverride: match.priceOverride,
        }
      : part;
  });

const palletPartsWithConfig = (
  unit: Pick<
    UnitDraft,
    'templateCode' | 'lengthMm' | 'widthMm' | 'topDeckMode' | 'topDeckCount' | 'bottomDeckMode' | 'bottomDeckCount'
  >,
  previous: PalletComponentInput[] = [],
): PalletComponentInput[] =>
  mergePartOverrides(
    applyPalletDeckCounts(
      palletTemplateComponents(
        unit.templateCode as PalletTemplateType,
        unit.lengthMm,
        unit.widthMm,
      ),
      {
        top: unit.topDeckMode === 'manual' ? unit.topDeckCount : undefined,
        bottom: unit.bottomDeckMode === 'manual' ? unit.bottomDeckCount : undefined,
      },
    ),
    previous,
  );

export const createPalletDraft = (templateCode = 'block'): UnitDraft => {
  const option =
    PALLET_TEMPLATE_OPTIONS.find((item) => item.value === templateCode) ??
    PALLET_TEMPLATE_OPTIONS[0]!;
  return {
    key: randomUuid(),
    unitType: 'PALLET',
    templateCode: option.value,
    name:
      option.value === 'block'
        ? '1200×800 出口实木托盘'
        : `${option.defaultLengthMm}×${option.defaultWidthMm} ${option.label}`,
    lengthMm: option.defaultLengthMm,
    widthMm: option.defaultWidthMm,
    targetLoadKg: 500,
    loadType: 'uniform',
    entryDirection: '4',
    innerLengthMm: option.defaultLengthMm,
    innerWidthMm: option.defaultWidthMm,
    innerHeightMm: 900,
    thicknessMm: 15,
    bottomThicknessMm: 15,
    baseHeightMm: 90,
    frameThicknessMm: 90,
    steelStrapCount: 2,
    runnerCount: 3,
    runnerWidthMm: 90,
    strapWidthMm: 30,
    strapDirection: 'horizontal',
    panelThicknessMm: 15,
    panelCoverage: 'none',
    hasLid: true,
    layerHeightMm: 200,
    layerCount: 1,
    lapWidthMm: 30,
    hingeCount: 4,
    dunnageLengthMm: 1200,
    dunnageWidthMm: 90,
    dunnageThicknessMm: 90,
    dunnageQuantity: 3,
    dunnageArrangement: 'parallel',
    topDeckMode: 'auto',
    topDeckCount: null,
    bottomDeckMode: 'auto',
    bottomDeckCount: null,
    parts: palletTemplateComponents(
      option.value,
      option.defaultLengthMm,
      option.defaultWidthMm,
    ),
  };
};

export const createCrateDraft = (): UnitDraft => {
  const params = { ...CRATE_DEFAULT_PARAMS };
  const outer = deriveCrateOuter(params);
  return {
    key: randomUuid(),
    unitType: 'CRATE',
    templateCode: CRATE_TEMPLATE_CODE,
    name: '普通木箱 G 型',
    lengthMm: outer.lengthMm,
    widthMm: outer.widthMm,
    targetLoadKg: 300,
    loadType: 'uniform',
    entryDirection: '4',
    ...params,
    panelThicknessMm: 15,
    panelCoverage: 'none',
    hasLid: true,
    layerHeightMm: 200,
    layerCount: 1,
    lapWidthMm: 30,
    hingeCount: 4,
    dunnageLengthMm: 1200,
    dunnageWidthMm: 90,
    dunnageThicknessMm: 90,
    dunnageQuantity: 3,
    dunnageArrangement: 'parallel',
    topDeckMode: 'auto',
    topDeckCount: null,
    bottomDeckMode: 'auto',
    bottomDeckCount: null,
    parts: deriveCrateParts(params),
  };
};

export const createSkidDraft = (): UnitDraft => {
  const params = { ...CRATE_DEFAULT_PARAMS };
  const outer = deriveCrateOuter(params);
  return {
    key: randomUuid(),
    unitType: 'SKID',
    templateCode: SKID_TEMPLATE_CODE,
    name: '滑木箱 G 型',
    lengthMm: outer.lengthMm,
    widthMm: outer.widthMm,
    targetLoadKg: 300,
    loadType: 'uniform',
    entryDirection: '4',
    ...params,
    panelThicknessMm: 15,
    panelCoverage: 'none',
    hasLid: true,
    layerHeightMm: 200,
    layerCount: 1,
    lapWidthMm: 30,
    hingeCount: 4,
    dunnageLengthMm: 1200,
    dunnageWidthMm: 90,
    dunnageThicknessMm: 90,
    dunnageQuantity: 3,
    dunnageArrangement: 'parallel',
    topDeckMode: 'auto',
    topDeckCount: null,
    bottomDeckMode: 'auto',
    bottomDeckCount: null,
    parts: deriveCrateParts(params),
  };
};

export const createSteelStrapDraft = (): UnitDraft => {
  const params = {
    ...CRATE_DEFAULT_PARAMS,
    // 钢带箱默认无木框架，由钢带承担箱体紧固。
    frameThicknessMm: 0,
    steelStrapCount: 4,
    strapWidthMm: 30,
    strapDirection: 'horizontal' as const,
  };
  const outer = deriveCrateOuter(params);
  return {
    key: randomUuid(),
    unitType: 'STEEL_STRAP',
    templateCode: STEEL_STRAP_TEMPLATE_CODE,
    name: '钢带箱 G 型',
    lengthMm: outer.lengthMm,
    widthMm: outer.widthMm,
    targetLoadKg: 300,
    loadType: 'uniform',
    entryDirection: '4',
    ...params,
    panelThicknessMm: 15,
    panelCoverage: 'none',
    hasLid: true,
    layerHeightMm: 200,
    layerCount: 1,
    lapWidthMm: 30,
    hingeCount: 4,
    dunnageLengthMm: 1200,
    dunnageWidthMm: 90,
    dunnageThicknessMm: 90,
    dunnageQuantity: 3,
    dunnageArrangement: 'parallel',
    topDeckMode: 'auto',
    topDeckCount: null,
    bottomDeckMode: 'auto',
    bottomDeckCount: null,
    parts: deriveCrateParts(params),
  };
};

export const createFrameDraft = (): UnitDraft => {
  const params = { ...FRAME_DEFAULT_PARAMS };
  const outer = deriveFrameOuter(params);
  return {
    key: randomUuid(),
    unitType: 'FRAME',
    templateCode: FRAME_TEMPLATE_CODE,
    name: '框架箱 G 型',
    lengthMm: outer.lengthMm,
    widthMm: outer.widthMm,
    targetLoadKg: 300,
    loadType: 'uniform',
    entryDirection: '4',
    ...params,
    thicknessMm: 15,
    runnerCount: 3,
    strapWidthMm: 30,
    strapDirection: 'horizontal',
    layerHeightMm: 200,
    layerCount: 1,
    lapWidthMm: 30,
    hingeCount: 4,
    dunnageLengthMm: 1200,
    dunnageWidthMm: 90,
    dunnageThicknessMm: 90,
    dunnageQuantity: 3,
    dunnageArrangement: 'parallel',
    topDeckMode: 'auto',
    topDeckCount: null,
    bottomDeckMode: 'auto',
    bottomDeckCount: null,
    parts: deriveFrameParts(params),
  };
};

export const createDividerDraft = (): UnitDraft => {
  const params = { ...DIVIDER_DEFAULT_PARAMS };
  const outer = deriveDividerOuter(params);
  return {
    key: randomUuid(),
    unitType: 'DIVIDER',
    templateCode: DIVIDER_TEMPLATE_CODE,
    name: '围板 G 型',
    lengthMm: outer.lengthMm,
    widthMm: outer.widthMm,
    targetLoadKg: 100,
    loadType: 'uniform',
    entryDirection: '4',
    ...params,
    innerHeightMm: 200,
    bottomThicknessMm: 8,
    baseHeightMm: 0,
    frameThicknessMm: 0,
    dunnageLengthMm: 1200,
    dunnageWidthMm: 90,
    dunnageThicknessMm: 90,
    dunnageQuantity: 3,
    dunnageArrangement: 'parallel',
    runnerCount: 3,
    runnerWidthMm: 90,
    steelStrapCount: 0,
    strapWidthMm: 30,
    strapDirection: 'horizontal',
    panelThicknessMm: 15,
    panelCoverage: 'none',
    hasLid: true,
    topDeckMode: 'auto',
    topDeckCount: null,
    bottomDeckMode: 'auto',
    bottomDeckCount: null,
    parts: deriveDividerParts(params),
  };
};

export const createDunnageDraft = (): UnitDraft => {
  const params = { ...DUNNAGE_DEFAULT_PARAMS };
  const outer = deriveDunnageOuter(params);
  return {
    key: randomUuid(),
    unitType: 'DUNNAGE',
    templateCode: DUNNAGE_TEMPLATE_CODE,
    name: '垫木 G 型',
    ...params,
    lengthMm: outer.lengthMm,
    widthMm: outer.widthMm,
    targetLoadKg: 100,
    loadType: 'uniform',
    entryDirection: '4',
    innerLengthMm: 1200,
    innerWidthMm: 800,
    innerHeightMm: 900,
    bottomThicknessMm: 90,
    baseHeightMm: 90,
    frameThicknessMm: 90,
    steelStrapCount: 0,
    runnerCount: 3,
    runnerWidthMm: 90,
    strapWidthMm: 30,
    strapDirection: 'horizontal',
    panelThicknessMm: 15,
    panelCoverage: 'none',
    hasLid: true,
    layerHeightMm: 200,
    layerCount: 1,
    lapWidthMm: 30,
    hingeCount: 4,
    dunnageLengthMm: params.lengthMm,
    dunnageWidthMm: params.widthMm,
    dunnageThicknessMm: params.thicknessMm,
    dunnageQuantity: params.quantity,
    dunnageArrangement: params.arrangement,
    topDeckMode: 'auto',
    topDeckCount: null,
    bottomDeckMode: 'auto',
    bottomDeckCount: null,
    parts: deriveDunnageParts(params),
  };
};

export const createNewDocument = (): PackagingDocument => {
  const unit = createPalletDraft();
  return {
    project: {
      ...defaultProject,
      name: '未命名方案',
    },
    units: [unit],
  };
};

export const toUnitDraft = (
  item: PackagingProjectDto['units'][number],
  index: number,
): UnitDraft => {
  const params = item.params ?? {};
  const templateCode = item.templateCode;
  const unitType: UnitDraft['unitType'] =
    item.unitType === 'CRATE'
      ? 'CRATE'
      : item.unitType === 'SKID'
        ? 'SKID'
        : item.unitType === 'FRAME'
          ? 'FRAME'
          : item.unitType === 'DIVIDER'
            ? 'DIVIDER'
            : item.unitType === 'DUNNAGE'
              ? 'DUNNAGE'
              : item.unitType === 'STEEL_STRAP'
                ? 'STEEL_STRAP'
                : 'PALLET';
  const crateLike = isCrateLike(unitType);
  const frameLike = isFrame(unitType);
  const dividerLike = isDivider(unitType);
  const dunnageLike = isDunnage(unitType);
  const parts = toComponents(item.parts);
  const hasCrateConfig = typeof params.frameThicknessMm === 'number';
  const hasFrameConfig =
    typeof params.panelThicknessMm === 'number' || typeof params.panelCoverage === 'string';
  const hasDividerConfig = typeof params.layerCount === 'number';
  const hasDunnageConfig = typeof params.arrangement === 'string';
  const thicknessMm = numberOr(params.thicknessMm, 15);
  const frameThicknessMm = numberOrZero(
    params.frameThicknessMm,
    unitType === 'STEEL_STRAP' ? 0 : 90,
  );
  const crateParams = {
    innerLengthMm: numberOr(
      params.innerLengthMm,
      Math.max(1, item.lengthMm - 2 * (thicknessMm + frameThicknessMm)),
    ),
    innerWidthMm: numberOr(
      params.innerWidthMm,
      Math.max(1, item.widthMm - 2 * (thicknessMm + frameThicknessMm)),
    ),
    innerHeightMm: numberOr(params.innerHeightMm, 900),
    thicknessMm,
    bottomThicknessMm: numberOr(params.bottomThicknessMm, thicknessMm),
    baseHeightMm: numberOr(params.baseHeightMm, 90),
    frameThicknessMm,
    steelStrapCount: numberOrZero(params.steelStrapCount, 2),
    runnerCount: numberOr(params.runnerCount, 3),
    runnerWidthMm: numberOr(params.runnerWidthMm, 90),
    strapWidthMm: numberInRange(params.strapWidthMm, 30, 10, 60),
    strapDirection: params.strapDirection === 'both' ? ('both' as const) : ('horizontal' as const),
  };
  const frameCoverage: FramePanelCoverage =
    params.panelCoverage === 'sides' || params.panelCoverage === 'full'
      ? params.panelCoverage
      : 'none';
  const frameParams = {
    innerLengthMm: numberOr(
      params.innerLengthMm,
      Math.max(1, item.lengthMm - 2 * numberOr(params.frameThicknessMm, 90)),
    ),
    innerWidthMm: numberOr(
      params.innerWidthMm,
      Math.max(1, item.widthMm - 2 * numberOr(params.frameThicknessMm, 90)),
    ),
    innerHeightMm: numberOr(params.innerHeightMm, 900),
    frameThicknessMm: numberOr(params.frameThicknessMm, 90),
    bottomThicknessMm: numberOr(params.bottomThicknessMm, 15),
    baseHeightMm: numberOr(params.baseHeightMm, 90),
    runnerWidthMm: numberOr(params.runnerWidthMm, 90),
    panelThicknessMm: numberOrZero(params.panelThicknessMm, 15),
    panelCoverage: frameCoverage,
    hasLid: params.hasLid !== false,
    steelStrapCount: numberOrZero(params.steelStrapCount, 0),
  };
  const dividerParams = {
    innerLengthMm: numberOr(params.innerLengthMm, Math.max(1, item.lengthMm - 16)),
    innerWidthMm: numberOr(params.innerWidthMm, Math.max(1, item.widthMm - 16)),
    layerHeightMm: numberOr(params.layerHeightMm, 200),
    layerCount: Math.max(1, Math.min(3, numberOrZero(params.layerCount, 1))),
    thicknessMm: numberOr(params.thicknessMm, 8),
    lapWidthMm: numberOrZero(params.lapWidthMm, 30),
    hingeCount: Math.max(0, Math.min(4, numberOrZero(params.hingeCount, 4))),
  };
  const dunnageParams = {
    lengthMm: numberOr(params.lengthMm, Math.max(1, item.lengthMm)),
    widthMm: numberOr(params.widthMm, Math.max(1, item.widthMm)),
    thicknessMm: numberOr(params.thicknessMm, 90),
    quantity: Math.max(1, Math.min(20, numberOrZero(params.quantity, 3))),
    arrangement: params.arrangement === 'cross' ? ('cross' as const) : ('parallel' as const),
  };
  const outer = dunnageLike
    ? deriveDunnageOuter(dunnageParams)
    : dividerLike
      ? deriveDividerOuter(dividerParams)
      : frameLike
        ? deriveFrameOuter(frameParams)
        : deriveCrateOuter(crateParams);
  const defaults = palletDeckDefaults(
    templateCode as PalletTemplateType,
    item.lengthMm,
    item.widthMm,
  );
  const topPart = parts.find((part) => part.role === 'topDeck');
  const bottomPart = parts.find((part) => part.role === 'bottomDeck');
  const partTopCount = topPart ? Math.round(topPart.quantity) : null;
  const partBottomCount = bottomPart ? Math.round(bottomPart.quantity) : null;
  const deck = asRecord(params.deck);
  const topConfig = asRecord(deck?.top);
  const bottomConfig = asRecord(deck?.bottom);
  const inferredTopMode: PalletDeckMode =
    partTopCount !== null && defaults.top !== null && partTopCount !== defaults.top
      ? 'manual'
      : 'auto';
  const inferredBottomMode: PalletDeckMode =
    partBottomCount !== null && defaults.bottom !== null && partBottomCount !== defaults.bottom
      ? 'manual'
      : 'auto';
  const topDeckMode: PalletDeckMode =
    topConfig?.mode === 'manual' || topConfig?.mode === 'auto'
      ? topConfig.mode
      : inferredTopMode;
  const bottomDeckMode: PalletDeckMode =
    bottomConfig?.mode === 'manual' || bottomConfig?.mode === 'auto'
      ? bottomConfig.mode
      : inferredBottomMode;
  const topDeckCount =
    topDeckMode === 'manual'
      ? clampPalletDeckCount(
          typeof topConfig?.count === 'number'
            ? topConfig.count
            : (partTopCount ?? defaults.top ?? 1),
        )
      : null;
  const bottomDeckCount =
    bottomDeckMode === 'manual'
      ? clampPalletDeckCount(
          typeof bottomConfig?.count === 'number'
            ? bottomConfig.count
            : (partBottomCount ?? defaults.bottom ?? 1),
        )
      : null;

  return {
    key: `saved-${item.id}-${index}`,
    unitType,
    templateCode,
    name: item.name,
    lengthMm: unitType === 'PALLET' ? item.lengthMm : outer.lengthMm,
    widthMm: unitType === 'PALLET' ? item.widthMm : outer.widthMm,
    targetLoadKg: item.targetLoadKg,
    loadType: item.loadType as PackagingLoadType,
    entryDirection: params.entryDirection === '2' ? '2' : '4',
    innerLengthMm: dividerLike
      ? dividerParams.innerLengthMm
      : frameLike
        ? frameParams.innerLengthMm
        : crateParams.innerLengthMm,
    innerWidthMm: dividerLike
      ? dividerParams.innerWidthMm
      : frameLike
        ? frameParams.innerWidthMm
        : crateParams.innerWidthMm,
    innerHeightMm: dividerLike
      ? dividerParams.layerHeightMm
      : frameLike
        ? frameParams.innerHeightMm
        : crateParams.innerHeightMm,
    thicknessMm: dividerLike
      ? dividerParams.thicknessMm
      : frameLike
        ? 15
        : crateParams.thicknessMm,
    bottomThicknessMm: frameLike ? frameParams.bottomThicknessMm : crateParams.bottomThicknessMm,
    baseHeightMm: frameLike ? frameParams.baseHeightMm : crateParams.baseHeightMm,
    frameThicknessMm: frameLike ? frameParams.frameThicknessMm : crateParams.frameThicknessMm,
    steelStrapCount: frameLike ? frameParams.steelStrapCount : crateParams.steelStrapCount,
    runnerCount: frameLike ? 3 : crateParams.runnerCount,
    runnerWidthMm: frameLike ? frameParams.runnerWidthMm : crateParams.runnerWidthMm,
    strapWidthMm: frameLike ? 30 : crateParams.strapWidthMm,
    strapDirection: frameLike ? 'horizontal' : crateParams.strapDirection,
    panelThicknessMm: frameLike ? frameParams.panelThicknessMm : 15,
    panelCoverage: frameLike ? frameParams.panelCoverage : 'none',
    hasLid: frameLike ? frameParams.hasLid : true,
    layerHeightMm: dividerLike ? dividerParams.layerHeightMm : 200,
    layerCount: dividerLike ? dividerParams.layerCount : 1,
    lapWidthMm: dividerLike ? dividerParams.lapWidthMm : 30,
    hingeCount: dividerLike ? dividerParams.hingeCount : 4,
    dunnageLengthMm: dunnageLike ? dunnageParams.lengthMm : 1200,
    dunnageWidthMm: dunnageLike ? dunnageParams.widthMm : 90,
    dunnageThicknessMm: dunnageLike ? dunnageParams.thicknessMm : 90,
    dunnageQuantity: dunnageLike ? dunnageParams.quantity : 3,
    dunnageArrangement: dunnageLike ? dunnageParams.arrangement : 'parallel',
    topDeckMode,
    topDeckCount,
    bottomDeckMode,
    bottomDeckCount,
    parts: dunnageLike
      ? hasDunnageConfig
        ? parts
        : deriveDunnageParts(dunnageParams)
      : dividerLike
        ? hasDividerConfig
          ? parts
          : deriveDividerParts(dividerParams)
        : frameLike
          ? hasFrameConfig
            ? parts
            : deriveFrameParts(frameParams)
          : crateLike && !hasCrateConfig
            ? deriveCrateParts(crateParams)
            : parts,
  };
};

export const fromProjectDto = (item: PackagingProjectDto): PackagingDocument => ({
  project: {
    name: item.name,
    customerName: item.customerName,
    destination: item.destination as PackagingDestination,
    note: item.note,
  },
  // 工作台 1:1：只读取当前（首个）单元；多单元仅是后端兼容结构。
  units: item.units.length > 0 ? [toUnitDraft(item.units[0]!, 0)] : [createPalletDraft()],
});

export const isProjectEditable = (canManage: boolean, status: string): boolean =>
  canManage && status !== 'ISSUED' && status !== 'ARCHIVED';

export type UnitIssues = ReturnType<typeof validateUnit>;

export const validateUnit = (unit: UnitDraft) =>
  isDunnage(unit.unitType)
    ? validateDunnageStructure(unit.parts, {
        quantity: unit.dunnageQuantity,
        arrangement: unit.dunnageArrangement,
      })
    : isDivider(unit.unitType)
    ? validateDividerStructure(unit.parts, {
        layerCount: unit.layerCount,
        lapWidthMm: unit.lapWidthMm,
        innerLengthMm: unit.innerLengthMm,
        innerWidthMm: unit.innerWidthMm,
      })
    : isFrame(unit.unitType)
    ? validateFrameStructure(unit.parts, {
        panelCoverage: unit.panelCoverage,
        hasLid: unit.hasLid,
      })
    : isCrateLike(unit.unitType)
      ? validateCrateStructure(unit.parts)
      : validatePalletStructure(
          { widthMm: unit.widthMm, templateType: unit.templateCode as PalletTemplateType },
          unit.parts,
        );

export type DocumentAction =
  | { type: 'updateProject'; patch: Partial<ProjectState> }
  | { type: 'updateUnit'; index: number; patch: Partial<UnitDraft> }
  | { type: 'updateParts'; index: number; parts: PalletComponentInput[] }
  | {
      type: 'updatePart';
      unitIndex: number;
      partIndex: number;
      patch: Partial<PalletComponentInput>;
    }
  | { type: 'movePart'; unitIndex: number; partIndex: number; direction: -1 | 1 }
  | {
      type: 'selectCatalogItem';
      unitType:
        | 'PALLET'
        | 'CRATE'
        | 'SKID'
        | 'FRAME'
        | 'DIVIDER'
        | 'DUNNAGE'
        | 'STEEL_STRAP';
      templateCode: string;
    }
  | { type: 'changeTemplate'; index: number; templateCode: string }
  | {
      type: 'applyPalletDims';
      index: number;
      patch: Partial<Pick<UnitDraft, 'lengthMm' | 'widthMm'>>;
    }
  | {
      type: 'applyCrateParams';
      index: number;
      patch: Partial<
        Pick<
          UnitDraft,
          | 'innerLengthMm'
          | 'innerWidthMm'
          | 'innerHeightMm'
          | 'thicknessMm'
          | 'bottomThicknessMm'
          | 'baseHeightMm'
          | 'frameThicknessMm'
          | 'steelStrapCount'
          | 'runnerCount'
          | 'runnerWidthMm'
          | 'strapWidthMm'
          | 'strapDirection'
        >
      >;
    }
  | {
      type: 'applyFrameParams';
      index: number;
      patch: Partial<
        Pick<
          UnitDraft,
          | 'innerLengthMm'
          | 'innerWidthMm'
          | 'innerHeightMm'
          | 'frameThicknessMm'
          | 'bottomThicknessMm'
          | 'baseHeightMm'
          | 'runnerWidthMm'
          | 'panelThicknessMm'
          | 'panelCoverage'
          | 'hasLid'
          | 'steelStrapCount'
        >
      >;
    }
  | {
      type: 'applyDividerParams';
      index: number;
      patch: Partial<
        Pick<
          UnitDraft,
          | 'innerLengthMm'
          | 'innerWidthMm'
          | 'layerHeightMm'
          | 'layerCount'
          | 'thicknessMm'
          | 'lapWidthMm'
          | 'hingeCount'
        >
      >;
    }
  | {
      type: 'applyDunnageParams';
      index: number;
      patch: Partial<
        Pick<
          UnitDraft,
          | 'dunnageLengthMm'
          | 'dunnageWidthMm'
          | 'dunnageThicknessMm'
          | 'dunnageQuantity'
          | 'dunnageArrangement'
        >
      >;
    }
  | {
      type: 'configureDeck';
      index: number;
      deck: 'top' | 'bottom';
      mode: PalletDeckMode;
      count?: number | null;
    };

const replaceUnit = (
  units: UnitDraft[],
  index: number,
  updater: (unit: UnitDraft) => UnitDraft,
): UnitDraft[] => units.map((unit, current) => (current === index ? updater(unit) : unit));

export function documentReducer(
  state: PackagingDocument,
  action: DocumentAction,
): PackagingDocument {
  switch (action.type) {
    case 'updateProject':
      return { ...state, project: { ...state.project, ...action.patch } };
    case 'updateUnit':
      return {
        ...state,
        units: replaceUnit(state.units, action.index, (unit) => ({ ...unit, ...action.patch })),
      };
    case 'updateParts':
      return {
        ...state,
        units: replaceUnit(state.units, action.index, (unit) => ({
          ...unit,
          parts: action.parts,
        })),
      };
    case 'updatePart':
      return {
        ...state,
        units: replaceUnit(state.units, action.unitIndex, (unit) => {
          const target = unit.parts[action.partIndex];
          const parts = unit.parts.map((part, current) =>
            current === action.partIndex ? { ...part, ...action.patch } : part,
          );
          if (target && action.patch.quantity !== undefined) {
            const quantity = clampPalletDeckCount(action.patch.quantity);
            if (target.role === 'topDeck') {
              return { ...unit, parts, topDeckMode: 'manual', topDeckCount: quantity };
            }
            if (target.role === 'bottomDeck') {
              return { ...unit, parts, bottomDeckMode: 'manual', bottomDeckCount: quantity };
            }
          }
          return { ...unit, parts };
        }),
      };
    case 'movePart': {
      const target = state.units[action.unitIndex];
      if (!target) return state;
      const nextIndex = action.partIndex + action.direction;
      if (nextIndex < 0 || nextIndex >= target.parts.length) return state;
      return {
        ...state,
        units: replaceUnit(state.units, action.unitIndex, (unit) => {
          const parts = [...unit.parts];
          const [item] = parts.splice(action.partIndex, 1);
          parts.splice(nextIndex, 0, item!);
          return { ...unit, parts };
        }),
      };
    }
    case 'selectCatalogItem': {
      const next =
        action.unitType === 'CRATE'
          ? createCrateDraft()
          : action.unitType === 'SKID'
            ? createSkidDraft()
            : action.unitType === 'FRAME'
              ? createFrameDraft()
              : action.unitType === 'DIVIDER'
                ? createDividerDraft()
                : action.unitType === 'DUNNAGE'
                  ? createDunnageDraft()
                  : action.unitType === 'STEEL_STRAP'
                    ? createSteelStrapDraft()
                    : createPalletDraft(action.templateCode);
      if (action.unitType === 'PALLET' && next.templateCode !== action.templateCode) {
        return state;
      }
      return { ...state, units: [next] };
    }
    case 'changeTemplate': {
      const target = state.units[action.index];
      if (!target) return state;
      if (isDunnage(target.unitType)) {
        return {
          ...state,
          units: replaceUnit(state.units, action.index, (unit) =>
            applyDunnageParamsToUnit({ ...unit, templateCode: DUNNAGE_TEMPLATE_CODE }, {}),
          ),
        };
      }
      if (isDivider(target.unitType)) {
        return {
          ...state,
          units: replaceUnit(state.units, action.index, (unit) =>
            applyDividerParamsToUnit({ ...unit, templateCode: DIVIDER_TEMPLATE_CODE }, {}),
          ),
        };
      }
      if (isFrame(target.unitType)) {
        return {
          ...state,
          units: replaceUnit(state.units, action.index, (unit) =>
            applyFrameParamsToUnit({ ...unit, templateCode: FRAME_TEMPLATE_CODE }, {}),
          ),
        };
      }
      if (isCrateLike(target.unitType)) {
        const templateCode =
          target.unitType === 'SKID'
            ? SKID_TEMPLATE_CODE
            : target.unitType === 'STEEL_STRAP'
              ? STEEL_STRAP_TEMPLATE_CODE
              : CRATE_TEMPLATE_CODE;
        return {
          ...state,
          units: replaceUnit(state.units, action.index, (unit) =>
            applyCrateParamsToUnit({ ...unit, templateCode }, {}),
          ),
        };
      }
      const option = PALLET_TEMPLATE_OPTIONS.find((item) => item.value === action.templateCode);
      if (!option) return state;
      return {
        ...state,
        units: replaceUnit(state.units, action.index, (unit) => {
          if (option.value === unit.templateCode) return unit;
          const next = {
            ...unit,
            templateCode: option.value,
            name:
              option.value === 'block'
                ? '1200×800 出口实木托盘'
                : `${unit.lengthMm}×${unit.widthMm} ${option.label}`,
          };
          // 保留当前尺寸与铺板配置，只按新模板重建构件；手动覆盖不继承。
          return { ...next, parts: palletPartsWithConfig(next) };
        }),
      };
    }
    case 'applyPalletDims':
      return {
        ...state,
        units: replaceUnit(state.units, action.index, (unit) => {
          const lengthMm = Math.max(1, Math.round(action.patch.lengthMm ?? unit.lengthMm));
          const widthMm = Math.max(1, Math.round(action.patch.widthMm ?? unit.widthMm));
          const next = { ...unit, lengthMm, widthMm };
          return { ...next, parts: palletPartsWithConfig(next, unit.parts) };
        }),
      };
    case 'configureDeck':
      return {
        ...state,
        units: replaceUnit(state.units, action.index, (unit) => {
          const role = action.deck === 'top' ? 'topDeck' : 'bottomDeck';
          const defaults = palletDeckDefaults(
            unit.templateCode as PalletTemplateType,
            unit.lengthMm,
            unit.widthMm,
          );
          const fallbackCount =
            action.deck === 'top' ? defaults.top : defaults.bottom;
          const currentPart = unit.parts.find((part) => part.role === role);
          if (!currentPart) return unit;
          const count =
            action.mode === 'manual'
              ? clampPalletDeckCount(
                  action.count ?? (action.deck === 'top' ? unit.topDeckCount : unit.bottomDeckCount) ?? currentPart.quantity,
                )
              : null;
          const quantity = count ?? Math.max(1, Math.round(fallbackCount ?? currentPart.quantity));
          const parts = unit.parts.map((part) =>
            part.role === role ? { ...part, quantity } : part,
          );
          return action.deck === 'top'
            ? { ...unit, parts, topDeckMode: action.mode, topDeckCount: count }
            : { ...unit, parts, bottomDeckMode: action.mode, bottomDeckCount: count };
        }),
      };
    case 'applyCrateParams':
      return {
        ...state,
        units: replaceUnit(state.units, action.index, (unit) =>
          applyCrateParamsToUnit(unit, action.patch),
        ),
      };
    case 'applyFrameParams':
      return {
        ...state,
        units: replaceUnit(state.units, action.index, (unit) =>
          applyFrameParamsToUnit(unit, action.patch),
        ),
      };
    case 'applyDividerParams':
      return {
        ...state,
        units: replaceUnit(state.units, action.index, (unit) =>
          applyDividerParamsToUnit(unit, action.patch),
        ),
      };
    case 'applyDunnageParams':
      return {
        ...state,
        units: replaceUnit(state.units, action.index, (unit) =>
          applyDunnageParamsToUnit(unit, action.patch),
        ),
      };
    default:
      return state;
  }
}

export const projectPayload = (
  document: PackagingDocument,
  override?: { name?: string; customerName?: string },
) => ({
  name: override?.name ?? document.project.name,
  customerName: override?.customerName ?? document.project.customerName,
  destination: document.project.destination,
  note: document.project.note,
  // 工作台 1:1：只提交当前（首个）单元；API 契约仍接受数组。
  units: document.units.slice(0, 1).map((item) => ({
    unitType: item.unitType,
    templateCode: item.templateCode,
    name: item.name,
    lengthMm: item.lengthMm,
    widthMm: item.widthMm,
    targetLoadKg: item.targetLoadKg,
    loadType: item.loadType,
    params:
      item.unitType === 'PALLET'
        ? {
            entryDirection: item.entryDirection,
            deck: {
              top: {
                mode: item.topDeckMode,
                count: item.topDeckMode === 'manual' ? item.topDeckCount : null,
              },
              bottom: {
                mode: item.bottomDeckMode,
                count: item.bottomDeckMode === 'manual' ? item.bottomDeckCount : null,
              },
            },
          }
        : item.unitType === 'DUNNAGE'
          ? {
              lengthMm: item.dunnageLengthMm,
              widthMm: item.dunnageWidthMm,
              thicknessMm: item.dunnageThicknessMm,
              quantity: item.dunnageQuantity,
              arrangement: item.dunnageArrangement,
              entryDirection: item.entryDirection,
            }
          : item.unitType === 'DIVIDER'
          ? {
              innerLengthMm: item.innerLengthMm,
              innerWidthMm: item.innerWidthMm,
              layerHeightMm: item.layerHeightMm,
              layerCount: item.layerCount,
              thicknessMm: item.thicknessMm,
              lapWidthMm: item.lapWidthMm,
              hingeCount: item.hingeCount,
              entryDirection: item.entryDirection,
            }
          : item.unitType === 'FRAME'
            ? {
                innerLengthMm: item.innerLengthMm,
                innerWidthMm: item.innerWidthMm,
                innerHeightMm: item.innerHeightMm,
                frameThicknessMm: item.frameThicknessMm,
              bottomThicknessMm: item.bottomThicknessMm,
              baseHeightMm: item.baseHeightMm,
              runnerWidthMm: item.runnerWidthMm,
              panelThicknessMm: item.panelThicknessMm,
              panelCoverage: item.panelCoverage,
              hasLid: item.hasLid,
              steelStrapCount: item.steelStrapCount,
              entryDirection: item.entryDirection,
            }
          : {
              innerLengthMm: item.innerLengthMm,
              innerWidthMm: item.innerWidthMm,
              innerHeightMm: item.innerHeightMm,
              thicknessMm: item.thicknessMm,
              bottomThicknessMm: item.bottomThicknessMm,
              baseHeightMm: item.baseHeightMm,
              frameThicknessMm: item.frameThicknessMm,
              steelStrapCount: item.steelStrapCount,
              runnerCount: item.runnerCount,
              runnerWidthMm: item.runnerWidthMm,
              strapWidthMm: item.strapWidthMm,
              strapDirection: item.strapDirection,
              entryDirection: item.entryDirection,
            },
    parts: item.parts.map((part) => ({
      ...part,
      role: part.role as PackagingPartInput['role'],
    })),
  })),
});

export const documentSignature = (document: PackagingDocument): string =>
  JSON.stringify(document);

export interface PackagingDraft {
  version: 1;
  savedAt: string;
  document: PackagingDocument;
}

export const serializeDraft = (document: PackagingDocument): string =>
  JSON.stringify({
    version: 1,
    savedAt: new Date().toISOString(),
    document,
  } satisfies PackagingDraft);

// 兼容 2026-11-18 之前的本机草稿：补齐配置字段并按最新口径重算外尺寸。
const normalizeUnitDraft = (unit: UnitDraft): UnitDraft => {
  if (isDunnage(unit.unitType)) {
    const params = {
      lengthMm: numberOr(unit.dunnageLengthMm, 1200),
      widthMm: numberOr(unit.dunnageWidthMm, 90),
      thicknessMm: numberOr(unit.dunnageThicknessMm, 90),
      quantity: Math.max(1, Math.min(20, numberOrZero(unit.dunnageQuantity, 3))),
      arrangement: unit.dunnageArrangement === 'cross' ? ('cross' as const) : ('parallel' as const),
    };
    const outer = deriveDunnageOuter(params);
    return {
      ...unit,
      ...params,
      lengthMm: outer.lengthMm,
      widthMm: outer.widthMm,
      dunnageLengthMm: params.lengthMm,
      dunnageWidthMm: params.widthMm,
      dunnageThicknessMm: params.thicknessMm,
      dunnageQuantity: params.quantity,
      dunnageArrangement: params.arrangement,
      topDeckMode: unit.topDeckMode === 'manual' ? 'manual' : 'auto',
      topDeckCount: unit.topDeckCount ?? null,
      bottomDeckMode: unit.bottomDeckMode === 'manual' ? 'manual' : 'auto',
      bottomDeckCount: unit.bottomDeckCount ?? null,
      parts: unit.parts?.length ? unit.parts : deriveDunnageParts(params),
    };
  }
  if (isDivider(unit.unitType)) {
    const params = {
      innerLengthMm: numberOr(unit.innerLengthMm, 1200),
      innerWidthMm: numberOr(unit.innerWidthMm, 800),
      layerHeightMm: numberOr(unit.layerHeightMm, 200),
      layerCount: Math.max(1, Math.min(3, numberOrZero(unit.layerCount, 1))),
      thicknessMm: numberOr(unit.thicknessMm, 8),
      lapWidthMm: numberOrZero(unit.lapWidthMm, 30),
      hingeCount: Math.max(0, Math.min(4, numberOrZero(unit.hingeCount, 4))),
    };
    const outer = deriveDividerOuter(params);
    return {
      ...unit,
      ...params,
      lengthMm: outer.lengthMm,
      widthMm: outer.widthMm,
      topDeckMode: unit.topDeckMode === 'manual' ? 'manual' : 'auto',
      topDeckCount: unit.topDeckCount ?? null,
      bottomDeckMode: unit.bottomDeckMode === 'manual' ? 'manual' : 'auto',
      bottomDeckCount: unit.bottomDeckCount ?? null,
      parts: unit.parts?.length ? unit.parts : deriveDividerParts(params),
    };
  }
  if (isFrame(unit.unitType)) {
    const panelCoverage: FramePanelCoverage =
      unit.panelCoverage === 'sides' || unit.panelCoverage === 'full'
        ? unit.panelCoverage
        : 'none';
    const params = {
      innerLengthMm: numberOr(unit.innerLengthMm, 1200),
      innerWidthMm: numberOr(unit.innerWidthMm, 800),
      innerHeightMm: numberOr(unit.innerHeightMm, 900),
      frameThicknessMm: numberOr(unit.frameThicknessMm, 90),
      bottomThicknessMm: numberOr(unit.bottomThicknessMm, 15),
      baseHeightMm: numberOr(unit.baseHeightMm, 90),
      runnerWidthMm: numberOr(unit.runnerWidthMm, 90),
      panelThicknessMm: numberOrZero(unit.panelThicknessMm, 15),
      panelCoverage,
      hasLid: unit.hasLid !== false,
      steelStrapCount: numberOrZero(unit.steelStrapCount, 0),
    };
    const outer = deriveFrameOuter(params);
    return {
      ...unit,
      ...params,
      lengthMm: outer.lengthMm,
      widthMm: outer.widthMm,
      topDeckMode: unit.topDeckMode === 'manual' ? 'manual' : 'auto',
      topDeckCount: unit.topDeckCount ?? null,
      bottomDeckMode: unit.bottomDeckMode === 'manual' ? 'manual' : 'auto',
      bottomDeckCount: unit.bottomDeckCount ?? null,
      parts: unit.parts?.length ? unit.parts : deriveFrameParts(params),
    };
  }
  if (isCrateLike(unit.unitType)) {
    const legacyCrate = typeof unit.frameThicknessMm !== 'number';
    const thicknessMm = numberOr(unit.thicknessMm, 15);
    const params = {
      innerLengthMm: numberOr(unit.innerLengthMm, 1200),
      innerWidthMm: numberOr(unit.innerWidthMm, 800),
      innerHeightMm: numberOr(unit.innerHeightMm, 900),
      thicknessMm,
      bottomThicknessMm: numberOr(unit.bottomThicknessMm, thicknessMm),
      baseHeightMm: numberOr(unit.baseHeightMm, 90),
      frameThicknessMm: numberOrZero(unit.frameThicknessMm, unit.unitType === 'STEEL_STRAP' ? 0 : 90),
      steelStrapCount: numberOrZero(unit.steelStrapCount, 2),
      runnerCount: numberOr(unit.runnerCount, 3),
      runnerWidthMm: numberOr(unit.runnerWidthMm, 90),
      strapWidthMm: numberInRange(unit.strapWidthMm, 30, 10, 60),
      strapDirection: unit.strapDirection === 'both' ? ('both' as const) : ('horizontal' as const),
      panelThicknessMm: 15,
      panelCoverage: 'none' as const,
      hasLid: true,
    };
    const outer = deriveCrateOuter(params);
    return {
      ...unit,
      ...params,
      lengthMm: outer.lengthMm,
      widthMm: outer.widthMm,
      topDeckMode: unit.topDeckMode === 'manual' ? 'manual' : 'auto',
      topDeckCount: unit.topDeckCount ?? null,
      bottomDeckMode: unit.bottomDeckMode === 'manual' ? 'manual' : 'auto',
      bottomDeckCount: unit.bottomDeckCount ?? null,
      parts: !legacyCrate && unit.parts?.length ? unit.parts : deriveCrateParts(params),
    };
  }
  return {
    ...unit,
    innerLengthMm: numberOr(unit.innerLengthMm, unit.lengthMm),
    innerWidthMm: numberOr(unit.innerWidthMm, unit.widthMm),
    innerHeightMm: numberOr(unit.innerHeightMm, 900),
    thicknessMm: numberOr(unit.thicknessMm, 15),
    bottomThicknessMm: numberOr(unit.bottomThicknessMm, 15),
    baseHeightMm: numberOr(unit.baseHeightMm, 90),
    frameThicknessMm: numberOr(unit.frameThicknessMm, 90),
    steelStrapCount: numberOrZero(unit.steelStrapCount, 2),
    runnerCount: numberOr(unit.runnerCount, 3),
    runnerWidthMm: numberOr(unit.runnerWidthMm, 90),
    strapWidthMm: numberInRange(unit.strapWidthMm, 30, 10, 60),
    strapDirection: unit.strapDirection === 'both' ? 'both' : 'horizontal',
    panelThicknessMm: numberOrZero(unit.panelThicknessMm, 15),
    panelCoverage:
      unit.panelCoverage === 'sides' || unit.panelCoverage === 'full' ? unit.panelCoverage : 'none',
    hasLid: unit.hasLid !== false,
    topDeckMode: unit.topDeckMode === 'manual' ? 'manual' : 'auto',
    topDeckCount: unit.topDeckMode === 'manual' ? (unit.topDeckCount ?? null) : null,
    bottomDeckMode: unit.bottomDeckMode === 'manual' ? 'manual' : 'auto',
    bottomDeckCount: unit.bottomDeckMode === 'manual' ? (unit.bottomDeckCount ?? null) : null,
    parts: unit.parts?.length
      ? unit.parts
      : palletTemplateComponents(
          unit.templateCode as PalletTemplateType,
          unit.lengthMm,
          unit.widthMm,
        ),
  };
};

export const parseDraft = (raw: string | null): PackagingDraft | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PackagingDraft>;
    if (value.version !== 1 || !value.document || !Array.isArray(value.document.units)) {
      return null;
    }
    if (value.document.units.length === 0) {
      return null;
    }
    return {
      ...(value as PackagingDraft),
      document: {
        ...value.document,
        units: value.document.units.slice(0, 1).map(normalizeUnitDraft),
      },
    };
  } catch {
    return null;
  }
};

export const draftStorageKey = (
  username: string | null,
  projectId: string | null,
  tabId: string,
): string =>
  `mcc:packaging:draft:${username ?? 'anon'}:${projectId ?? `new:${tabId}`}`;

export interface HistoryState {
  past: PackagingDocument[];
  present: PackagingDocument;
  future: PackagingDocument[];
  lastMergeKey: string | null;
  lastMergeAt: number;
}

export type HistoryAction =
  | { type: 'apply'; action: DocumentAction; mergeKey?: string; at?: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'replace'; document: PackagingDocument };

const HISTORY_LIMIT = 50;
const MERGE_WINDOW_MS = 700;

export const createHistory = (document: PackagingDocument): HistoryState => ({
  past: [],
  present: document,
  future: [],
  lastMergeKey: null,
  lastMergeAt: 0,
});

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'apply': {
      const present = documentReducer(state.present, action.action);
      if (present === state.present) return state;
      const at = action.at ?? Date.now();
      const merge =
        Boolean(action.mergeKey) &&
        state.lastMergeKey === action.mergeKey &&
        at - state.lastMergeAt <= MERGE_WINDOW_MS;
      return {
        past: merge ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
        present,
        future: [],
        lastMergeKey: action.mergeKey ?? null,
        lastMergeAt: at,
      };
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1]!;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        lastMergeKey: null,
        lastMergeAt: 0,
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const next = state.future[0]!;
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: state.future.slice(1),
        lastMergeKey: null,
        lastMergeAt: 0,
      };
    }
    case 'replace':
      return createHistory(action.document);
    default:
      return state;
  }
}
