import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

// 服务内唯一的 Redis 连接（登录失败锁定等，design/账号与权限.md §5）。
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor() {
    super(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit().catch(() => undefined);
  }
}