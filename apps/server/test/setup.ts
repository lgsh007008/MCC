import 'dotenv/config';
import { PrismaClient } from '@mcc/db';
import Redis from 'ioredis';

// 集成测试夹具（技术方案 §10）：
// 1) 使用独立测试租户（TN-90001），与演示 / 正式数据隔离，避免库存期初、账号额度互相影响；
// 2) 每个测试文件启动前清空限流计数与该租户的业务数据，保证可重复；
// 3) 首次运行时创建测试租户与套餐（全局表，幂等）。

export const TEST_TENANT_ID = 'it-tenant';
export const TEST_TENANT_CODE = 'TN-90001';
const TEST_PLAN_ID = '00000000-0000-4000-8000-0000000000aa';
const SELLABLE_FEATURES = [
  'order',
  'customer',
  'purchase',
  'supplier',
  'production',
  'finance',
  'audit',
  'pallet_design',
];

const prisma = new PrismaClient();

// 套餐：测试租户额度放宽，功能全开，保证账号与功能用例稳定
await prisma.plan.upsert({
  where: { id: TEST_PLAN_ID },
  update: { name: '集成测试套餐', maxAccounts: 1000, status: 'ACTIVE' },
  create: {
    id: TEST_PLAN_ID,
    name: '集成测试套餐',
    maxAccounts: 1000,
    status: 'ACTIVE',
  },
});
for (const featureCode of SELLABLE_FEATURES) {
  await prisma.planFeature.upsert({
    where: {
      planId_featureCode: { planId: TEST_PLAN_ID, featureCode },
    },
    update: {},
    create: { planId: TEST_PLAN_ID, featureCode },
  });
}
await prisma.tenant.upsert({
  where: { id: TEST_TENANT_ID },
  update: { status: 'ACTIVE', planId: TEST_PLAN_ID },
  create: {
    id: TEST_TENANT_ID,
    code: TEST_TENANT_CODE,
    name: '集成测试租户',
    planId: TEST_PLAN_ID,
    status: 'ACTIVE',
  },
});

// 清空测试租户的全部业务表数据（按 information_schema 动态发现带 tenant_id 的表）
const tenantTables = await prisma.$queryRaw<Array<{ table_name: string }>>`
  SELECT table_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = 'tenant_id'
`;
for (const table of tenantTables) {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "${table.table_name}" WHERE tenant_id = $1`,
    TEST_TENANT_ID,
  );
}

// 测试账号由各 spec 自建；此处不做账号初始化。

await prisma.$disconnect();

// 清空本机 Redis 限流计数，避免多个 spec 的登录请求叠加触发 30 次/分钟限制
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const keys = await redis.keys('rate:*');
if (keys.length > 0) {
  await redis.del(...keys);
}
await redis.quit();
