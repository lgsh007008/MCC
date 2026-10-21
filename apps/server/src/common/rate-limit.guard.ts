import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { problem } from './http-problem.js';
import { RedisService } from './redis.service.js';
import { RATE_LIMIT_META_KEY, type RateLimitOptions } from './decorators/rate-limit.decorator.js';

// 统一限流守卫（横切中间件，技术方案 §8.4）：
// 按「主体 IP + 接口路径」滑动窗口计数（Redis 过期键），超限 429。
// 登录类接口经 @RateLimit 收紧（30 次 / 60 秒），其余走默认（120 次 / 60 秒）。
// 与登录失败锁定（design/账号与权限.md §5，按账号维度防爆破）互补：一个节流、一个防爆破。
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = Reflect.getMetadata(RATE_LIMIT_META_KEY, context.getHandler()) as
      | RateLimitOptions
      | undefined;
    const { limit = 120, ttl = 60_000 } = options ?? {};

    const request = context.switchToHttp().getRequest<Request>();
    const subject = request.ip ?? 'unknown';
    const key = `rate:${subject}:${request.method}:${request.path}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.pexpire(key, ttl);
    }
    if (count > limit) {
      throw problem(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试');
    }
    return true;
  }
}