import { createHash } from 'node:crypto';
import { problem } from './http-problem.js';
import type { RedisService } from './redis.service.js';

export const IDEMPOTENCY_TTL_SECONDS = 86_400;

// 写操作幂等（技术方案 §6.3）：同用户 + 同资源 + 同键重复提交返回首请求结果；
// 处理中返回 409；未带键时直接执行。键只以 SHA-256 摘要入 Redis，不落原文。
// 仅用于创建类接口——返回体即首请求结果，调用方重放不会产生第二份数据。
export async function withIdempotency<T>(
  redis: RedisService,
  userId: string,
  resource: string,
  idempotencyKey: string | undefined,
  handler: () => Promise<T>,
): Promise<T> {
  if (!idempotencyKey) {
    return handler();
  }
  const key = `idem:${resource}:${userId}:${createHash('sha256').update(idempotencyKey).digest('hex')}`;
  const locked = await redis.set(key, 'pending', 'EX', IDEMPOTENCY_TTL_SECONDS, 'NX');
  if (locked === null) {
    const previous = await redis.get(key);
    if (previous && previous !== 'pending') {
      return JSON.parse(previous) as T;
    }
    throw problem(409, 'IN_PROGRESS', '同一请求正在处理中，请勿重复提交');
  }
  try {
    const result = await handler();
    await redis.set(key, JSON.stringify(result), 'EX', IDEMPOTENCY_TTL_SECONDS);
    return result;
  } catch (error) {
    await redis.del(key).catch(() => undefined);
    throw error;
  }
}
