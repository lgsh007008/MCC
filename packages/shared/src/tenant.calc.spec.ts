import { describe, expect, it } from 'vitest';

import {
  BASE_FEATURES,
  diffFeatures,
  isOverQuota,
  normalizeOverrides,
  resolveEffectiveFeatures,
} from './tenant.calc';

describe('resolveEffectiveFeatures', () => {
  it('基础功能永远启用，套餐为空也不例外', () => {
    expect(resolveEffectiveFeatures([])).toEqual([...BASE_FEATURES]);
  });

  it('并入套餐功能并保持稳定顺序', () => {
    expect(resolveEffectiveFeatures(['finance', 'order'])).toEqual([
      ...BASE_FEATURES,
      'order',
      'finance',
    ]);
  });

  it('租户加购与关闭只影响可售功能', () => {
    const effective = resolveEffectiveFeatures(
      ['order', 'finance'],
      [
        { featureCode: 'production', enabled: true },
        { featureCode: 'finance', enabled: false },
      ],
    );
    expect(effective).toEqual([...BASE_FEATURES, 'order', 'production']);
  });

  it('基础功能不能被覆盖关闭', () => {
    const effective = resolveEffectiveFeatures(
      [],
      [{ featureCode: 'account', enabled: false }],
    );
    expect(effective).toEqual([...BASE_FEATURES]);
  });

  it('未知功能标识被忽略', () => {
    const effective = resolveEffectiveFeatures(
      ['unknown', 'order'],
      [{ featureCode: 'also-unknown', enabled: true }],
    );
    expect(effective).toEqual([...BASE_FEATURES, 'order']);
  });
});

describe('normalizeOverrides', () => {
  it('丢弃与套餐默认值一致的覆盖项', () => {
    expect(
      normalizeOverrides(
        ['order', 'finance'],
        [
          { featureCode: 'order', enabled: true },
          { featureCode: 'finance', enabled: false },
          { featureCode: 'production', enabled: false },
        ],
      ),
    ).toEqual([{ featureCode: 'finance', enabled: false }]);
  });

  it('同一功能多次覆盖以最后一次为准', () => {
    expect(
      normalizeOverrides(
        [],
        [
          { featureCode: 'order', enabled: true },
          { featureCode: 'order', enabled: false },
        ],
      ),
    ).toEqual([]);
  });

  it('忽略基础功能与未知功能', () => {
    expect(
      normalizeOverrides(
        [],
        [
          { featureCode: 'account', enabled: false },
          { featureCode: 'unknown', enabled: true },
        ],
      ),
    ).toEqual([]);
  });
});

describe('isOverQuota', () => {
  it('账号数超过额度才算超额', () => {
    expect(isOverQuota(20, 20)).toBe(false);
    expect(isOverQuota(21, 20)).toBe(true);
  });
});

describe('diffFeatures', () => {
  it('输出新增与移除的功能', () => {
    expect(diffFeatures([...BASE_FEATURES, 'order'], [...BASE_FEATURES, 'finance'])).toEqual({
      added: ['finance'],
      removed: ['order'],
    });
  });
});
