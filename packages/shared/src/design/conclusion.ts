import type { PalletIssue } from './pallet/validation';

// 筛查结论（product/包装设计.md R-包装设计-017 / design §5.4）：
// 只做载荷与结构完整性的筛查，不做强度计算；阈值与免责声明是共享常量，
// 工作台、报告与后续方案对比只引用，不复制。

export type PackagingConclusionLevel = 'excellent' | 'available' | 'adjust';

export const PACKAGING_CONCLUSION_LABELS: Record<PackagingConclusionLevel, string> = {
  excellent: '优良',
  available: '可用',
  adjust: '需调整',
};

export const PACKAGING_CONCLUSION_THRESHOLDS = {
  excellentKgM2: 500,
  availableKgM2: 800,
} as const;

export const PACKAGING_CONCLUSION_DISCLAIMER = '筛查级结果，不代表承载合格。';

export interface PackagingConclusionInput {
  unitType: 'PALLET' | 'CRATE' | 'SKID' | 'FRAME' | 'DIVIDER' | 'DUNNAGE' | 'STEEL_STRAP';
  targetLoadKg: number | null;
  loadType: 'uniform' | 'concentrated';
  lengthMm: number;
  widthMm: number;
  innerLengthMm?: number;
  innerWidthMm?: number;
  issues?: PalletIssue[];
}

export interface PackagingConclusion {
  level: PackagingConclusionLevel;
  areaM2: number;
  areaLoadKgM2: number | null;
  reasons: string[];
  disclaimer: string;
}

const positive = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

export function evaluatePackagingConclusion(
  input: PackagingConclusionInput,
): PackagingConclusion {
  const issues = input.issues ?? [];
  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');
  const lengthMm =
    input.unitType === 'PALLET' ? positive(input.lengthMm) : positive(input.innerLengthMm ?? 0);
  const widthMm =
    input.unitType === 'PALLET' ? positive(input.widthMm) : positive(input.innerWidthMm ?? 0);
  const areaM2 = lengthMm > 0 && widthMm > 0 ? (lengthMm * widthMm) / 1e6 : 0;
  const targetLoadKg = positive(input.targetLoadKg ?? 0);
  const areaLoadKgM2 = areaM2 > 0 && targetLoadKg > 0 ? targetLoadKg / areaM2 : null;
  const disclaimer = PACKAGING_CONCLUSION_DISCLAIMER;

  if (errors.length > 0) {
    return {
      level: 'adjust',
      areaM2,
      areaLoadKgM2,
      reasons: errors.map((issue) => issue.message),
      disclaimer,
    };
  }

  if (areaM2 <= 0) {
    return {
      level: 'adjust',
      areaM2,
      areaLoadKgM2: null,
      reasons: ['底面积无效，无法计算单位面积载荷'],
      disclaimer,
    };
  }

  if (areaLoadKgM2 === null) {
    return {
      level: 'available',
      areaM2,
      areaLoadKgM2: null,
      reasons: [
        '未填写目标载荷，按结构完整性给出未评估结论',
        ...warnings.map((issue) => issue.message),
      ],
      disclaimer,
    };
  }

  let level: PackagingConclusionLevel;
  const reasons: string[] = [];

  if (areaLoadKgM2 > PACKAGING_CONCLUSION_THRESHOLDS.availableKgM2) {
    level = 'adjust';
    reasons.push(
      `单位面积载荷 ${areaLoadKgM2.toFixed(1)} kg/m² 超过 ${PACKAGING_CONCLUSION_THRESHOLDS.availableKgM2}，建议增加支承 / 铺板或降低载荷`,
    );
  } else if (areaLoadKgM2 > PACKAGING_CONCLUSION_THRESHOLDS.excellentKgM2) {
    level = 'available';
    reasons.push(
      `单位面积载荷 ${areaLoadKgM2.toFixed(1)} kg/m² 处于 ${PACKAGING_CONCLUSION_THRESHOLDS.excellentKgM2}–${PACKAGING_CONCLUSION_THRESHOLDS.availableKgM2} 筛查区间`,
    );
  } else {
    level = 'excellent';
    reasons.push(
      `单位面积载荷 ${areaLoadKgM2.toFixed(1)} kg/m² 不高于 ${PACKAGING_CONCLUSION_THRESHOLDS.excellentKgM2}`,
    );
  }

  if (warnings.length > 0) {
    reasons.push(...warnings.map((issue) => issue.message));
    if (level === 'excellent') level = 'available';
  }

  if (input.loadType === 'concentrated') {
    reasons.push('集中载荷需确认支承位置与局部加固');
    if (level === 'excellent') level = 'available';
  }

  return { level, areaM2, areaLoadKgM2, reasons, disclaimer };
}
