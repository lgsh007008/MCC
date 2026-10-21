import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service.js';

// 全服务唯一的 Redis 连接提供方（登录失败锁定等横切用途，design/账号与权限.md §5）。
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}