import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUuid } from './uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUuid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('生成 UUID v4 且不重复', () => {
    const values = new Set(Array.from({ length: 100 }, () => randomUuid()));
    expect(values.size).toBe(100);
    for (const value of values) {
      expect(value).toMatch(UUID_V4);
    }
  });

  it('非安全上下文（无 crypto.randomUUID）时回退生成', () => {
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: original.getRandomValues.bind(original) });
    const values = new Set(Array.from({ length: 50 }, () => randomUuid()));
    expect(values.size).toBe(50);
    for (const value of values) {
      expect(value).toMatch(UUID_V4);
    }
  });
});
