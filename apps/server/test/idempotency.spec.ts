import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { withIdempotency } from '../src/common/idempotency.js';
import type { RedisService } from '../src/common/redis.service.js';

// 统一幂等执行器（技术方案 §6.3）：无键直通、同键复用首结果、处理中 409、失败释放键。
// 用内存假 Redis 覆盖分支，不依赖真实 Redis。

function fakeRedis(): RedisService & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      // 只有 NX 才拒绝覆盖；写入结果时是无条件 SET（带 EX）
      if (args.includes('NX') && store.has(key)) {
        return null;
      }
      store.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
  } as unknown as RedisService & { store: Map<string, string> };
}

describe('withIdempotency', () => {
  it('未带键时每次都执行，不缓存结果', async () => {
    const redis = fakeRedis();
    const handler = vi.fn(async () => ({ id: Math.random() }));
    const first = await withIdempotency(redis, 'u1', 'customers', undefined, handler);
    const second = await withIdempotency(redis, 'u1', 'customers', undefined, handler);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(first).not.toEqual(second);
    expect(redis.store.size).toBe(0);
  });

  it('同用户同资源同键：第二次直接返回首请求结果', async () => {
    const redis = fakeRedis();
    const handler = vi.fn(async () => ({ id: 'c1', code: 'CT-00001' }));
    const first = await withIdempotency(redis, 'u1', 'customers', 'key-1', handler);
    const second = await withIdempotency(redis, 'u1', 'customers', 'key-1', handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('不同用户或不同资源同键互不影响', async () => {
    const redis = fakeRedis();
    const handler = vi.fn(async () => ({ id: 'c1' }));
    await withIdempotency(redis, 'u1', 'customers', 'same-key', handler);
    await withIdempotency(redis, 'u2', 'customers', 'same-key', handler);
    await withIdempotency(redis, 'u1', 'suppliers', 'same-key', handler);
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('处理中（键为 pending）返回 409 IN_PROGRESS', async () => {
    const redis = fakeRedis();
    const handler = vi.fn(async () => ({ id: 'c1' }));
    // 先占位，模拟并发请求仍在处理
    const key = `idem:customers:u1:${createHash('sha256').update('busy').digest('hex')}`;
    redis.store.set(key, 'pending');
    await expect(withIdempotency(redis, 'u1', 'customers', 'busy', handler)).rejects.toMatchObject({
      status: 409,
      response: { code: 'IN_PROGRESS' },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('业务失败时释放键，允许同键重试', async () => {
    const redis = fakeRedis();
    const handler = vi
      .fn<() => Promise<{ id: string }>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'c1' });
    await expect(withIdempotency(redis, 'u1', 'customers', 'retry', handler)).rejects.toThrow('boom');
    expect(redis.store.size).toBe(0);
    await expect(withIdempotency(redis, 'u1', 'customers', 'retry', handler)).resolves.toEqual({
      id: 'c1',
    });
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
