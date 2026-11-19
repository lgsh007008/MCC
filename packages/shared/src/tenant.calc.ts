// 租户领域计算纯函数（design/租户.md §3）：
// 有效功能 = 基础功能 ∪ 套餐功能 + 租户加购 − 租户关闭；额度判断。
// 前后端共用；纯函数单测为最高优先级（技术方案 §10）。

export const BASE_FEATURES = ['account', 'platform', 'tenant'] as const;
export const SELLABLE_FEATURES = [
  'order',
  'customer',
  'purchase',
  'supplier',
  'production',
  'finance',
  'audit',
  'packaging_design',
] as const;

export const FEATURE_CODES = [...BASE_FEATURES, ...SELLABLE_FEATURES] as const;
export type FeatureCode = (typeof FEATURE_CODES)[number];
export type SellableFeatureCode = (typeof SELLABLE_FEATURES)[number];

export const FEATURE_LABELS: Record<FeatureCode, string> = {
  account: '账号与权限',
  platform: '平台布局',
  tenant: '租户自身',
  order: '订单',
  customer: '客户',
  purchase: '采购',
  supplier: '供应商',
  production: '生产与库存',
  finance: '财务',
  audit: '审计',
  packaging_design: '包装设计',
};

export interface FeatureOverride {
  featureCode: string;
  enabled: boolean;
}

export function isFeatureCode(value: unknown): value is FeatureCode {
  return typeof value === 'string' && (FEATURE_CODES as readonly string[]).includes(value);
}

export function isSellableFeature(value: unknown): value is SellableFeatureCode {
  return typeof value === 'string' && (SELLABLE_FEATURES as readonly string[]).includes(value);
}

export function isBaseFeature(code: FeatureCode): boolean {
  return (BASE_FEATURES as readonly string[]).includes(code);
}

/**
 * 解析租户的有效功能。
 * - 基础功能永远启用，不可被套餐或覆盖移除；
 * - 未知功能标识忽略（避免脏数据扩大权限）；
 * - 输出去重、按 FEATURE_CODES 稳定排序。
 */
export function resolveEffectiveFeatures(
  planFeatures: readonly string[],
  overrides: readonly FeatureOverride[] = [],
): FeatureCode[] {
  const enabled = new Set<FeatureCode>(BASE_FEATURES);

  for (const code of planFeatures) {
    if (isFeatureCode(code) && !isBaseFeature(code)) {
      enabled.add(code);
    }
  }

  for (const override of overrides) {
    if (!isFeatureCode(override.featureCode) || isBaseFeature(override.featureCode)) {
      continue;
    }
    if (override.enabled) {
      enabled.add(override.featureCode);
    } else {
      enabled.delete(override.featureCode);
    }
  }

  return FEATURE_CODES.filter((code) => enabled.has(code));
}

/**
 * 只保留与套餐默认值不同的覆盖项；同功能多次出现时以最后一次为准。
 * 用于写入 tenant_features，保证「只存偏差」。
 */
export function normalizeOverrides(
  planFeatures: readonly string[],
  overrides: readonly FeatureOverride[],
): FeatureOverride[] {
  const plan = new Set(planFeatures.filter(isSellableFeature));
  const lastByCode = new Map<SellableFeatureCode, boolean>();

  for (const override of overrides) {
    if (!isSellableFeature(override.featureCode)) {
      continue;
    }
    lastByCode.set(override.featureCode, override.enabled);
  }

  const normalized: FeatureOverride[] = [];
  for (const [featureCode, enabled] of lastByCode) {
    if (enabled !== plan.has(featureCode)) {
      normalized.push({ featureCode, enabled });
    }
  }
  return normalized;
}

export function isOverQuota(accountCount: number, maxAccounts: number): boolean {
  return accountCount > maxAccounts;
}

/** 套餐变更时的功能差异，供平台详情页展示；入参可为有效功能数组 */
export function diffFeatures(
  before: readonly string[],
  after: readonly string[],
): { added: FeatureCode[]; removed: FeatureCode[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: FEATURE_CODES.filter((code) => !beforeSet.has(code) && afterSet.has(code)),
    removed: FEATURE_CODES.filter((code) => beforeSet.has(code) && !afterSet.has(code)),
  };
}
