import { SetMetadata } from '@nestjs/common';

// 限流窗口元数据（技术方案 §8.4：统一限流，登录类重点防护）。
// RateLimitGuard 读取；未标注的接口按默认窗口（120 次 / 60 秒）。
export const RATE_LIMIT_META_KEY = 'rate-limit';
export interface RateLimitOptions {
  limit: number;
  ttl: number;
}

export const RateLimit = (limit: number, ttl: number): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_META_KEY, { limit, ttl } satisfies RateLimitOptions);