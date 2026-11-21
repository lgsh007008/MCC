// 一次性初始化账号（design/账号与权限.md §2、design/租户.md §9）：
// 首个租户账号由本脚本初始化；其他租户可经平台开通或自助注册创建。
// 租户（TN-00001）与标准版套餐由迁移写入；本脚本补建租户管理员与平台运营账号。

import 'dotenv/config';
import { PrismaClient } from '@mcc/db';
import { hash } from '@node-rs/argon2';

const DEFAULT_TENANT_ID = 'default';
// 平台运营身份独立于租户账号（design/账号与权限.md R-账号与权限-004）
const INITIAL_PLATFORM_ACCOUNTS = [{ username: 'opsadmin', password: 'Mcc@2026' }] as const;

async function main(): Promise<void> {
  // 生产只允许真实手机号（ADR-015）：seed 不内置默认手机号，必须由环境变量显式提供。
  const adminPhone = process.env.SEED_ADMIN_PHONE?.trim();
  if (!adminPhone || !/^1[3-9]\d{9}$/.test(adminPhone)) {
    throw new Error('缺少 SEED_ADMIN_PHONE（11 位真实手机号，见 .env.example）');
  }
  const initialTenantAccounts = [
    { username: 'admin', phone: adminPhone, password: 'Mcc@2026' },
  ] as const;

  // seed 使用未扩展的原始 client：不经租户扩展，业务表写入显式带 tenantId
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: DEFAULT_TENANT_ID } });
    if (!tenant) {
      throw new Error('缺少首个租户（先执行 prisma migrate deploy）');
    }

    for (const account of initialTenantAccounts) {
      const existing = await prisma.user.findFirst({
        where: { tenantId: tenant.id, username: account.username },
      });
      if (existing) {
        if (!existing.phone || existing.mustChangePassword) {
          await prisma.user.update({
            where: { id: existing.id },
            data: {
              phone: existing.phone ?? account.phone,
              mustChangePassword: false,
            },
          });
          console.log(`租户账号 ${account.username} 已补齐手机号并清掉待改密标记`);
        } else {
          console.log(`租户账号 ${account.username} 已存在，跳过`);
        }
        continue;
      }
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          username: account.username,
          phone: account.phone,
          passwordHash: await hash(account.password),
          role: 'ADMIN',
        },
      });
      console.log(
        `租户账号 ${account.username} 已创建（租户 ${tenant.code}，手机号 ${account.phone}）`,
      );
    }

    for (const account of INITIAL_PLATFORM_ACCOUNTS) {
      const existing = await prisma.platformUser.findFirst({
        where: { username: account.username },
      });
      if (existing) {
        console.log(`平台账号 ${account.username} 已存在，跳过`);
        continue;
      }
      await prisma.platformUser.create({
        data: {
          username: account.username,
          passwordHash: await hash(account.password),
          role: 'PLATFORM_ADMIN',
        },
      });
      console.log(`平台账号 ${account.username} 已创建（/ops/login，首次登录后请及时修改密码）`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
