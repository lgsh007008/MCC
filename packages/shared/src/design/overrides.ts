import type { PalletComponentInput } from '../pallet.schemas';

// 构件来源（product/包装设计.md R-包装设计-013 / design §5.1）：
// 不单独存储覆盖标记；读取时用「配置派生默认值」与「当前构件」逐字段比较，
// 保证 BOM、构件表与报告看到同一份结果。

export type PartSource = 'auto' | 'manual';

export type PartOverrideField =
  | 'role'
  | 'name'
  | 'materialCode'
  | 'orientation'
  | 'lengthMm'
  | 'widthMm'
  | 'heightMm'
  | 'quantity'
  | 'wastePct'
  | 'processCost'
  | 'priceOverride';

export type PartSourceReason = 'derived' | 'diff' | 'config' | 'unmatched';

export interface PartSourceInfo {
  source: PartSource;
  changedFields: PartOverrideField[];
  reason: PartSourceReason;
}

const COMPARE_FIELDS: PartOverrideField[] = [
  'role',
  'name',
  'materialCode',
  'orientation',
  'lengthMm',
  'widthMm',
  'heightMm',
  'quantity',
  'wastePct',
  'processCost',
  'priceOverride',
];

const sameValue = (left: unknown, right: unknown): boolean => {
  if (typeof left === 'number' && typeof right === 'number') {
    return Math.abs(left - right) < 1e-9;
  }
  return left === right;
};

export function comparePartSource(
  derived: PalletComponentInput | undefined,
  actual: PalletComponentInput,
): PartSourceInfo {
  if (!derived) {
    return { source: 'manual', changedFields: [], reason: 'unmatched' };
  }
  const changedFields = COMPARE_FIELDS.filter(
    (field) => !sameValue(derived[field], actual[field]),
  );
  return changedFields.length > 0
    ? { source: 'manual', changedFields, reason: 'diff' }
    : { source: 'auto', changedFields: [], reason: 'derived' };
}

/**
 * 按角色 + 名称匹配派生默认值；manualRoles 用于手动铺板模式：
 * 即使数量恰好等于模板默认值，也标记为手动（配置原因）。
 */
export function resolvePartSources(
  derived: PalletComponentInput[],
  actual: PalletComponentInput[],
  manualRoles: PalletComponentInput['role'][] = [],
): PartSourceInfo[] {
  return actual.map((part) => {
    const match = derived.find(
      (item) => item.role === part.role && item.name === part.name,
    );
    const info = comparePartSource(match, part);
    if (manualRoles.includes(part.role)) {
      return {
        source: 'manual',
        changedFields: info.changedFields,
        reason: info.reason === 'derived' ? 'config' : info.reason,
      };
    }
    return info;
  });
}
