import { describe, expect, it } from 'vitest';
import {
  evaluatePackagingConclusion,
  PACKAGING_CONCLUSION_DISCLAIMER,
} from './design/conclusion';
import type { PalletIssue } from './design/pallet/validation';

const baseInput = {
  unitType: 'PALLET' as const,
  targetLoadKg: 500,
  loadType: 'uniform' as const,
  lengthMm: 1000,
  widthMm: 1000,
};

const warning: PalletIssue = { level: 'warning', message: '层级顺序需确认' };
const error: PalletIssue = { level: 'error', message: '缺少底板' };

describe('包装筛查结论', () => {
  it('按 500 / 800 边界分级', () => {
    expect(evaluatePackagingConclusion({ ...baseInput, targetLoadKg: 500 }).level).toBe(
      'excellent',
    );
    expect(evaluatePackagingConclusion({ ...baseInput, targetLoadKg: 500.1 }).level).toBe(
      'available',
    );
    expect(evaluatePackagingConclusion({ ...baseInput, targetLoadKg: 800 }).level).toBe(
      'available',
    );
    expect(evaluatePackagingConclusion({ ...baseInput, targetLoadKg: 800.1 }).level).toBe(
      'adjust',
    );
  });

  it('空载荷记可用（未评估），错误优先记需调整', () => {
    const noLoad = evaluatePackagingConclusion({ ...baseInput, targetLoadKg: null });
    expect(noLoad.level).toBe('available');
    expect(noLoad.areaLoadKgM2).toBeNull();
    expect(noLoad.reasons.join('')).toContain('未填写目标载荷');

    const withError = evaluatePackagingConclusion({
      ...baseInput,
      targetLoadKg: 400,
      issues: [error],
    });
    expect(withError.level).toBe('adjust');
    expect(withError.reasons).toContain('缺少底板');
  });

  it('提示级校验与集中载荷把优良降为可用', () => {
    const withWarning = evaluatePackagingConclusion({
      ...baseInput,
      targetLoadKg: 400,
      issues: [warning],
    });
    expect(withWarning.level).toBe('available');
    expect(withWarning.reasons).toContain('层级顺序需确认');

    const concentrated = evaluatePackagingConclusion({
      ...baseInput,
      targetLoadKg: 400,
      loadType: 'concentrated',
    });
    expect(concentrated.level).toBe('available');
    expect(concentrated.reasons.join('')).toContain('集中载荷');
  });

  it('托盘取外形长宽，木箱取内长内宽', () => {
    const pallet = evaluatePackagingConclusion({
      ...baseInput,
      targetLoadKg: 480,
    });
    expect(pallet.areaM2).toBeCloseTo(1, 6);
    expect(pallet.areaLoadKgM2).toBeCloseTo(480, 6);
    expect(pallet.level).toBe('excellent');

    const crate = evaluatePackagingConclusion({
      unitType: 'CRATE',
      targetLoadKg: 480,
      loadType: 'uniform',
      lengthMm: 1410,
      widthMm: 1010,
      innerLengthMm: 1200,
      innerWidthMm: 800,
    });
    expect(crate.areaM2).toBeCloseTo(0.96, 6);
    expect(crate.areaLoadKgM2).toBeCloseTo(500, 6);
    expect(crate.level).toBe('excellent');

    const skid = evaluatePackagingConclusion({
      unitType: 'SKID',
      targetLoadKg: 480,
      loadType: 'uniform',
      lengthMm: 1410,
      widthMm: 1010,
      innerLengthMm: 1200,
      innerWidthMm: 800,
    });
    expect(skid.areaM2).toBeCloseTo(0.96, 6);
    expect(skid.level).toBe('excellent');
  });

  it('底面积无效时需调整，且始终带免责声明', () => {
    const invalid = evaluatePackagingConclusion({ ...baseInput, lengthMm: 0, widthMm: 0 });
    expect(invalid.level).toBe('adjust');
    expect(invalid.reasons.join('')).toContain('底面积无效');
    expect(invalid.disclaimer).toBe(PACKAGING_CONCLUSION_DISCLAIMER);
  });
});
