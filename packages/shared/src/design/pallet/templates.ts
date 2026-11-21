import type {
  PalletComponentInput,
  PalletComponentRole,
  PalletMaterialLike,
  PalletTemplateType,
} from './schemas';

// 托盘结构模板与默认材料（product/包装设计.md R-包装设计-012 / 013）：
// 默认构件是唯一实现；产品文档只登记结构关系，不重复尺寸与材料。

export const PALLET_ROLE_COLORS: Record<PalletComponentRole, string> = {
  topDeck: '#d3a064',
  endDeck: '#bd8650',
  stringerBoard: '#b77f48',
  block: '#8f6841',
  bottomDeck: '#b9824e',
  stringer: '#8f6841',
  runner: '#8f6841',
  plywood: '#c79b62',
  spacer: '#a77b4d',
  panel: '#c9a06a',
  frame: '#8f6841',
  batten: '#a77b4d',
  steelStrap: '#7d8791',
  dunnage: '#b09a7a',
  custom: '#9eaa9f',
};

export const PALLET_ROLE_LABELS: Record<PalletComponentRole, string> = {
  topDeck: '面板',
  endDeck: '端板',
  stringerBoard: '中间纵梁板',
  block: '墩块',
  bottomDeck: '底板',
  stringer: '纵梁',
  runner: '滑木',
  plywood: '胶合板面板',
  spacer: '垫块',
  panel: '箱板',
  frame: '框架',
  batten: '木条',
  steelStrap: '钢带',
  dunnage: '垫木',
  custom: '自定义',
};

export const PALLET_DEFAULT_MATERIALS: PalletMaterialLike[] = [
  { code: 'pine', name: '松木', densityKgM3: 500, pricePerM3: 1850, fumigation: true, color: '#b9824e' },
  { code: 'radiata-pine', name: '辐射松', densityKgM3: 500, pricePerM3: 2050, fumigation: true, color: '#b9824e' },
  { code: 'spruce', name: '云杉', densityKgM3: 450, pricePerM3: 2150, fumigation: true, color: '#c79b62' },
  { code: 'fir', name: '杉木', densityKgM3: 420, pricePerM3: 1850, fumigation: true, color: '#c79b62' },
  { code: 'sugi', name: '日本柳杉', densityKgM3: 380, pricePerM3: 2300, fumigation: true, color: '#d3a064' },
  { code: 'douglas-fir', name: '花旗松', densityKgM3: 530, pricePerM3: 2200, fumigation: true, color: '#bd8650' },
  { code: 'poplar', name: '杨木', densityKgM3: 450, pricePerM3: 1550, fumigation: true, color: '#d3a064' },
  { code: 'eucalyptus', name: '桉木', densityKgM3: 650, pricePerM3: 1750, fumigation: true, color: '#8f6841' },
  { code: 'hardwood', name: '混合硬木', densityKgM3: 600, pricePerM3: 1550, fumigation: true, color: '#8f6841' },
  { code: 'plywood', name: '胶合板', densityKgM3: 600, pricePerM3: 1850, fumigation: false, color: '#c79b62' },
  { code: 'lvl', name: 'LVL', densityKgM3: 550, pricePerM3: 2150, fumigation: false, color: '#b77f48' },
  { code: 'steel-strap', name: '钢带', densityKgM3: 7850, pricePerM3: 5800, fumigation: false, color: '#7d8791' },
];

export interface PalletTemplateOption {
  value: Exclude<PalletTemplateType, 'custom'>;
  label: string;
  defaultLengthMm: number;
  defaultWidthMm: number;
}

export const PALLET_TEMPLATE_OPTIONS: PalletTemplateOption[] = [
  { value: 'block', label: '九墩块四向进叉', defaultLengthMm: 1200, defaultWidthMm: 800 },
  { value: 'stringer', label: '三纵梁两向进叉', defaultLengthMm: 1100, defaultWidthMm: 1100 },
  { value: 'notched', label: '开槽纵梁四向进叉', defaultLengthMm: 1100, defaultWidthMm: 1100 },
  { value: 'skid', label: '滑木', defaultLengthMm: 1200, defaultWidthMm: 800 },
  { value: 'plywood', label: '胶合板', defaultLengthMm: 1200, defaultWidthMm: 800 },
];

export function palletTemplateComponents(
  templateType: PalletTemplateType,
  lengthMm: number,
  widthMm: number,
): PalletComponentInput[] {
  const base = { wastePct: 0.08, processCost: 1.2, priceOverride: 0 };
  if (templateType === 'plywood') {
    return [
      {
        role: 'plywood',
        name: '胶合板面板',
        materialCode: 'plywood',
        orientation: 'x',
        lengthMm,
        widthMm,
        heightMm: 18,
        quantity: 1,
        wastePct: 0.06,
        processCost: 12,
        priceOverride: 0,
      },
      {
        role: 'block',
        name: '墩块',
        materialCode: 'lvl',
        orientation: 'x',
        lengthMm: 90,
        widthMm: 90,
        heightMm: 90,
        quantity: 9,
        wastePct: 0.08,
        processCost: 0.8,
        priceOverride: 0,
      },
      {
        role: 'bottomDeck',
        name: '底板',
        materialCode: 'lvl',
        orientation: 'x',
        lengthMm,
        widthMm: 90,
        heightMm: 18,
        quantity: 3,
        wastePct: 0.08,
        processCost: 1.2,
        priceOverride: 0,
      },
    ];
  }
  if (templateType === 'stringer' || templateType === 'notched') {
    return [
      {
        role: 'topDeck',
        name: '面板',
        materialCode: 'pine',
        orientation: 'y',
        lengthMm: widthMm,
        widthMm: 90,
        heightMm: 20,
        quantity: 7,
        ...base,
      },
      {
        role: 'stringer',
        name: templateType === 'notched' ? '开槽纵梁' : '纵梁',
        materialCode: 'pine',
        orientation: 'x',
        lengthMm,
        widthMm: 38,
        heightMm: 90,
        quantity: 3,
        wastePct: 0.1,
        processCost: templateType === 'notched' ? 6 : 3,
        priceOverride: 0,
      },
      {
        role: 'bottomDeck',
        name: '底板',
        materialCode: 'pine',
        orientation: 'y',
        lengthMm: widthMm,
        widthMm: 90,
        heightMm: 20,
        quantity: 3,
        ...base,
      },
    ];
  }
  if (templateType === 'skid') {
    return [
      {
        role: 'topDeck',
        name: '面板',
        materialCode: 'pine',
        orientation: 'y',
        lengthMm: widthMm,
        widthMm: 90,
        heightMm: 20,
        quantity: 7,
        ...base,
      },
      {
        role: 'runner',
        name: '滑木',
        materialCode: 'pine',
        orientation: 'x',
        lengthMm,
        widthMm: 90,
        heightMm: 90,
        quantity: 3,
        wastePct: 0.1,
        processCost: 4,
        priceOverride: 0,
      },
    ];
  }
  // block / custom 默认走九墩块结构
  return [
    {
      role: 'topDeck',
      name: '面板',
      materialCode: 'pine',
      orientation: 'x',
      lengthMm,
      widthMm: 90,
      heightMm: 20,
      quantity: 5,
      wastePct: 0.08,
      processCost: 1.5,
      priceOverride: 0,
    },
    {
      role: 'stringerBoard',
      name: '中间纵梁板',
      materialCode: 'pine',
      orientation: 'y',
      lengthMm: widthMm,
      widthMm: 90,
      heightMm: 20,
      quantity: 3,
      ...base,
    },
    {
      role: 'block',
      name: '墩块',
      materialCode: 'pine',
      orientation: 'x',
      lengthMm: 90,
      widthMm: 90,
      heightMm: 70,
      quantity: 9,
      wastePct: 0.1,
      processCost: 0.8,
      priceOverride: 0,
    },
    {
      role: 'bottomDeck',
      name: '底板',
      materialCode: 'pine',
      orientation: 'x',
      lengthMm,
      widthMm: 90,
      heightMm: 20,
      quantity: 3,
      ...base,
    },
  ];
}

/** 铺板数量手动上限（product/包装设计.md R-包装设计-015）：超出按上限计算并在左栏显式提示。 */
export const PALLET_DECK_MAX = 10;

export type PalletDeckMode = 'auto' | 'manual';

export interface PalletDeckCounts {
  /** 上铺板（面板）数量；模板无面板时为 null */
  top: number | null;
  /** 下铺板（底板）数量；模板无底板时为 null */
  bottom: number | null;
}

const countRole = (
  templateType: PalletTemplateType,
  lengthMm: number,
  widthMm: number,
  role: 'topDeck' | 'bottomDeck',
): number | null => {
  const part = palletTemplateComponents(templateType, lengthMm, widthMm).find(
    (component) => component.role === role,
  );
  return part ? Math.max(1, Math.round(part.quantity)) : null;
};

/** 模板在当前尺寸下的铺板默认数量；用于「自动」模式与手动覆盖的初值。 */
export function palletDeckDefaults(
  templateType: PalletTemplateType,
  lengthMm: number,
  widthMm: number,
): PalletDeckCounts {
  return {
    top: countRole(templateType, lengthMm, widthMm, 'topDeck'),
    bottom: countRole(templateType, lengthMm, widthMm, 'bottomDeck'),
  };
}

export function clampPalletDeckCount(count: number): number {
  return Math.min(PALLET_DECK_MAX, Math.max(1, Math.round(Number.isFinite(count) ? count : 1)));
}

/** 把上 / 下铺板数量写回构件；其余构件保持模板派生结果。 */
export function applyPalletDeckCounts(
  components: PalletComponentInput[],
  counts: { top?: number | null; bottom?: number | null },
): PalletComponentInput[] {
  return components.map((component) => {
    if (component.role === 'topDeck' && counts.top != null) {
      return { ...component, quantity: clampPalletDeckCount(counts.top) };
    }
    if (component.role === 'bottomDeck' && counts.bottom != null) {
      return { ...component, quantity: clampPalletDeckCount(counts.bottom) };
    }
    return component;
  });
}
