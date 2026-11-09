import { Prisma } from '@mcc/db';
import { requestContext } from './request-context.js';

// ADR-005（2026-11-09 复活）：tenant_id 全表预留，租户条件由数据访问层集中附加。
// 约定：业务代码不得手写 tenantId 条件（读操作被强制过滤，写操作被强制落当前租户），
// 保证"漏一处则查不到 / 改不到"，与 ADR-005 后果段的纪律一致。
// 单租户阶段租户恒为 DEFAULT_TENANT_ID；将来多租户只需改 currentTenantId 的解析来源。

export const DEFAULT_TENANT_ID = 'default';

export function currentTenantId(): string {
  return requestContext.getStore()?.tenantId ?? DEFAULT_TENANT_ID;
}

type WritableWhereArgs = { where?: Record<string, unknown> };
type WritableDataArgs = { data?: Record<string, unknown> };

// Prisma defineExtension 的 $allModels 对各操作的 args/query 上下文类型推断不稳定
// （6.19 部分操作无推断），统一收敛为显式形状；扩展产物在 prisma.service.ts 中
// 回写为 PrismaClient 类型，调用方类型不受影响。
type TenantHook = (params: {
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
}) => unknown;

function withTenantWhere(args: Record<string, unknown>): void {
  const a = args as WritableWhereArgs;
  a.where = { AND: [a.where ?? {}, { tenantId: currentTenantId() }] };
}

function withTenantData(args: Record<string, unknown>): void {
  const a = args as WritableDataArgs;
  a.data = { ...a.data, tenantId: currentTenantId() };
}

// update 的 data（upsert 为 update）里不允许改写 tenant_id：租户归属只由系统落值
function stripTenantMutation(args: Record<string, unknown>): void {
  const a = args as WritableDataArgs;
  if (a.data && 'tenantId' in a.data) {
    delete a.data.tenantId;
  }
}

const hooks: Record<string, TenantHook> = {
  // 读：统一附加当前租户条件（无 where 也生成过滤）
  findUnique({ args, query }) {
    withTenantWhere(args);
    return query(args);
  },
  findFirst({ args, query }) {
    withTenantWhere(args);
    return query(args);
  },
  findMany({ args, query }) {
    withTenantWhere(args);
    return query(args);
  },
  count({ args, query }) {
    withTenantWhere(args);
    return query(args);
  },
  // 写：强制落当前租户
  create({ args, query }) {
    withTenantData(args);
    return query(args);
  },
  createMany({ args, query }) {
    const a = args as { data?: Record<string, unknown>[] };
    if (Array.isArray(a.data)) {
      a.data = a.data.map((row) => ({ ...row, tenantId: currentTenantId() }));
    }
    return query(args);
  },
  upsert({ args, query }) {
    withTenantWhere(args);
    const u = args as WritableDataArgs & {
      create?: Record<string, unknown>;
      update?: Record<string, unknown>;
    };
    u.create = { ...u.create, tenantId: currentTenantId() };
    u.update = { ...u.update, tenantId: currentTenantId() };
    return query(args);
  },
  // 改 / 删：必须先命中当前租户行；禁止经数据层迁移租户归属
  update({ args, query }) {
    withTenantWhere(args);
    stripTenantMutation(args);
    return query(args);
  },
  updateMany({ args, query }) {
    withTenantWhere(args);
    return query(args);
  },
  delete({ args, query }) {
    withTenantWhere(args);
    return query(args);
  },
  deleteMany({ args, query }) {
    withTenantWhere(args);
    return query(args);
  },
};

export const tenantExtension = Prisma.defineExtension({
  name: 'tenant',
  query: { $allModels: hooks },
} as never);