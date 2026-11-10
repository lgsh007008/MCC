// 存量编号重排（一次性脚本，1-产品文档.md「五、全局编号规范」）：
// 把旧编号（销售单 / 财务事件 YYYYMM-####、客户 C#####）统一改为
// 域前缀 + 连字符 + 5 位全局流水（SO-00001 / FN-00001 / CT-00001），不含日期。
//
// 约束与做法：
// - 必须与生成新编号的代码同批切换：先停写 → 备份 → 跑本脚本 → 部署新代码。
// - 全部在一个事务内完成；两阶段更新（先改为临时号，再按 createdAt 顺序赋正式号），
//   避免新旧格式混排时撞唯一约束。
// - 默认遇到「新旧混排」直接中止；本地数据可用 --force 强制全量重排。
// - 同步财务事件的 source_code（源单为销售单时）；输出「旧号 → 新号」对照表。
// - 明细编码不落库（接口按主单号 + 行序派生），无需迁移。
// - 单条记录的组织信息（tenant_id）由 Prisma 扩展附加；本脚本用原生 client，显式按 id 更新。
//
// 用法（在 apps/server 下）：
//   pnpm exec tsx scripts/renumber-codes.ts [对照表输出路径] [--force]

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@mcc/db';

const CODE_WIDTH = 5;
const pad = (seq: number): string => String(seq).padStart(CODE_WIDTH, '0');

const NEW_CODE_PATTERNS = [/^SO-\d+$/, /^FN-\d+$/, /^CT-\d+$/];
const force = process.argv.includes('--force');
const outputPath = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'renumber-map.csv';

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const [customers, orders, events] = await Promise.all([
      prisma.customer.findMany({
        select: { id: true, code: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.saleOrder.findMany({
        select: { id: true, code: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.financeEvent.findMany({
        select: { id: true, code: true, sourceCode: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const allCodes = [...customers, ...orders, ...events].map((row) => row.code);
    const newFormatCount = allCodes.filter((code) =>
      NEW_CODE_PATTERNS.some((re) => re.test(code)),
    ).length;
    const mixed = newFormatCount > 0 && newFormatCount < allCodes.length;

    if (mixed && !force) {
      throw new Error(
        `检测到新旧编号混排（新格式 ${newFormatCount} 条 / 共 ${allCodes.length} 条），已中止。` +
          '确认数据可全量重排后加 --force 重跑。',
      );
    }
    if (!mixed && newFormatCount === allCodes.length && allCodes.length > 0) {
      console.log('全部记录已是新编号格式，无需处理。');
      return;
    }

    const customerMap = new Map<string, string>();
    customers.forEach((row, index) => customerMap.set(row.code, `CT-${pad(index + 1)}`));

    const orderMap = new Map<string, string>();
    orders.forEach((row, index) => orderMap.set(row.code, `SO-${pad(index + 1)}`));

    const eventMap = new Map<string, string>();
    events.forEach((row, index) => eventMap.set(row.code, `FN-${pad(index + 1)}`));

    await prisma.$transaction(
      async (tx) => {
        // 第一阶段：全部改为临时号，清空旧号占位（避免两阶段之间撞唯一约束）
        for (const [index, row] of customers.entries()) {
          await tx.customer.update({ where: { id: row.id }, data: { code: `TMP-CT-${index + 1}` } });
        }
        for (const [index, row] of orders.entries()) {
          await tx.saleOrder.update({ where: { id: row.id }, data: { code: `TMP-SO-${index + 1}` } });
        }
        for (const [index, row] of events.entries()) {
          await tx.financeEvent.update({ where: { id: row.id }, data: { code: `TMP-FN-${index + 1}` } });
        }

        // 第二阶段：按创建顺序赋正式号，并同步源单号引用
        for (const row of customers) {
          await tx.customer.update({
            where: { id: row.id },
            data: { code: customerMap.get(row.code) as string },
          });
        }
        for (const row of orders) {
          const next = orderMap.get(row.code) as string;
          await tx.saleOrder.update({ where: { id: row.id }, data: { code: next } });
        }
        for (const row of events) {
          const next = eventMap.get(row.code) as string;
          const nextSourceCode =
            row.sourceCode && orderMap.has(row.sourceCode)
              ? (orderMap.get(row.sourceCode) as string)
              : row.sourceCode;
          await tx.financeEvent.update({
            where: { id: row.id },
            data: { code: next, sourceCode: nextSourceCode },
          });
        }
      },
      { timeout: 120_000 },
    );

    const orphanRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count
      FROM finance_events fe
      WHERE fe.source_code IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM sale_orders so WHERE so.code = fe.source_code)
    `;
    const orphanCount = Number(orphanRows[0]?.count ?? 0);

    const lines = ['type,old_code,new_code'];
    for (const [oldCode, newCode] of customerMap) {
      lines.push(`customer,${oldCode},${newCode}`);
    }
    for (const [oldCode, newCode] of orderMap) {
      lines.push(`sale_order,${oldCode},${newCode}`);
    }
    for (const [oldCode, newCode] of eventMap) {
      lines.push(`finance_event,${oldCode},${newCode}`);
    }
    writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');

    console.log(
      `重排完成：客户 ${customers.length}、销售单 ${orders.length}、财务事件 ${events.length}；对照表已写入 ${outputPath}`,
    );
    if (orphanCount > 0) {
      console.warn(
        `警告：${orphanCount} 条财务事件的源单号找不到对应销售单（多为源单已物理删除的历史数据），请人工核对。`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
