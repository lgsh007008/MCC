import { runWithTenant } from '../src/modules/tenant/tenant-context.js';

// 集成测试的租户夹具：setup.ts 创建 TN-90001 并在每个文件前清空其业务数据，
// 与演示 / 正式数据隔离（design/租户.md §10）。
export const TEST_TENANT_ID = 'it-tenant';
export const TEST_TENANT_CODE = 'TN-90001';

/**
 * 由测试账号名派生一个稳定的 11 位手机号（ADR-015 后登录标识）：
 * 同一测试文件内同一账号名始终得到同一号码，避免随机数导致重跑冲突。
 */
export function testPhone(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `13${String(800_000_000 + (hash % 100_000_000))}`;
}

/**
 * 给原始 Prisma Client 套一层租户作用域：每次委托方法调用都在 runWithTenant 内执行，
 * 与真实请求的数据访问路径一致（业务表必须带租户上下文）。
 * 用法：`db = scopedClient(prisma.client);` 之后用 `db.user.create(...)`。
 */
export function scopedClient<T extends object>(client: T, tenantId = TEST_TENANT_ID): T {
  const wrap = (target: object): object =>
    new Proxy(target, {
      get(obj, prop, receiver) {
        const value = Reflect.get(obj, prop, receiver);
        if (typeof value === 'function') {
          // Prisma 的委托方法返回惰性 PrismaPromise：必须在上下文内 await，
          // 否则真正执行查询时 runWithTenant 已结束，扩展读不到 tenantId。
          return (...args: unknown[]) =>
            runWithTenant(tenantId, async () =>
              (value as (...inner: unknown[]) => unknown).apply(obj, args),
            );
        }
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return wrap(value);
        }
        return value;
      },
    });
  return wrap(client) as T;
}
