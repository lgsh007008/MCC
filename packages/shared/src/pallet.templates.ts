import type {
  PalletComponentInput,
  PalletComponentRole,
  PalletMaterialLike,
  PalletTemplateType,
} from './pallet.schemas';

// 托盘结构模板与默认材料（product/托盘设计.md R-托盘设计-001 / 002）：
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
