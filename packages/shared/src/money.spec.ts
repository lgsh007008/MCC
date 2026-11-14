import { describe, expect, it } from 'vitest';
import { divRoundHalfUp, fromScaled, toScaled } from './money';

// 金额缩放工具单测（技术方案 §5.1：禁浮点；三域共用同一套舍入）

describe('金额缩放工具', () => {
  it('正负小数放大与还原', () => {
    expect(toScaled('12.34', 2)).toBe(1234n);
    expect(toScaled('-12.34', 2)).toBe(-1234n);
    expect(toScaled('1.5', 3)).toBe(1500n);
    expect(fromScaled(1234n, 2)).toBe('12.34');
    expect(fromScaled(-1234n, 2)).toBe('-12.34');
    expect(fromScaled(0n, 2)).toBe('0.00');
    expect(fromScaled(1500n, 3)).toBe('1.500');
  });

  it('省略整数位与零位小数', () => {
    expect(toScaled('.5', 2)).toBe(50n);
    expect(toScaled('-.5', 2)).toBe(-50n);
    expect(fromScaled(123n, 0)).toBe('123');
    expect(fromScaled(-123n, 0)).toBe('-123');
  });

  it('四舍五入（round half up）', () => {
    expect(divRoundHalfUp(1005n, 10n)).toBe(101n);
    expect(divRoundHalfUp(1004n, 10n)).toBe(100n);
  });
});
