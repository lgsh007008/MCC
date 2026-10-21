// 一次性初始化账号（design/账号与权限.md §2）：
// MVP 账号由系统初始化直接提供，无自助注册、无注册入口。

import 'dotenv/config';
import { PrismaClient } from '@mcc/db';
import { hash } from '@node-rs/argon2';

const INITIAL_ACCOUNTS = [{ username: 'admin', password: 'Mcc@2026' }] as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    for (const account of INITIAL_ACCOUNTS) {
      const existing = await prisma.user.findUnique({ where: { username: account.username } });
      if (existing) {
        console.log(`账号 ${account.username} 已存在，跳过`);
        continue;
      }
      await prisma.user.create({
        data: {
          username: account.username,
          passwordHash: await hash(account.password),
          role: 'SALES',
        },
      });
      console.log(`账号 ${account.username} 已创建（首次登录后请及时修改密码）`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});