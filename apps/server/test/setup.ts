import Redis from 'ioredis';

// 集成测试共用本机 Redis：每个测试文件启动前清空限流计数，
// 避免多个 spec 的登录请求叠加触发 30 次/分钟限制，导致 accessToken 缺失。
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const keys = await redis.keys('rate:*');
if (keys.length > 0) {
  await redis.del(...keys);
}
await redis.quit();
