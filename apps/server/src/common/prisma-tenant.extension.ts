import { Prisma } from '@mcc/db';
import { requestContext } from './request-context.js';

// ADR-005 / ADR-012：tenant_id 全表预留，租户条件由数据访问层集中附加。
// 约定：业务代码不得手写 tenantId 条件（读操作被强制过滤，写操作被强制落当前租户），
// 保证"漏一处则查不到 / 改不到"。
// 租户作用域缺失即抛错，不再兜底首租户（design/租户.md §2）：
// seed、迁移、平台开通流程必须显式 runWithTenant；全局表访问不需要租户上下文。

// 全局表（无 tenant_id）：不属于任何租户，必须跳过租户过滤（design/租户.md §2）。
const GLOBAL_MODELS = new Set([
  'Tenant',
  'Plan',
  'PlanFeature',
  'TenantFeature',
  'PlatformUser',
  'PlatformRefreshToken',
  'PlatformEventLog',
]);

export function currentTenantId(): string {
  const tenantId = requestContext.getStore()?.tenantId;
  if (!tenantId) {
    throw new Error(
      '[prisma-tenant] 缺少租户上下文：业务表访问必须在 runWithTenant(...) 内执行',
    );
  }
  return tenantId;
}

type WritableWhereArgs = { where?: Record<string, unknown> };
type WritableDataArgs = { data?: Record<string, unknown> };

// Prisma defineExtension 的 $allModels 对各操作的 args/query 上下文类型推断不稳定
// （6.19 部分操作无推断），统一收敛为显式形状；扩展产物在 prisma.service.ts 中
// 回写为 PrismaClient 类型，调用方类型不受影响。
type TenantHook = (params: {
  model: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
}) => unknown;

function scoped(model: string): boolean {
  return !GLOBAL_MODELS.has(model);
}

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
  // findUnique/update/delete/upsert 的 where 是 WhereUniqueInput，不接受 AND 结构，
  // 无法注入租户条件（注入会触发 Prisma 运行时校验错误）：
  //   - findUnique：按唯一键定位后校验租户，异租户行返回 null（ID 为不可推测 UUID，命中即本租户）
  //   - update/delete/upsert：业务表直接抛错禁用——单行改删必须走 updateMany/deleteMany，
  //     保证「漏一处则改不到」；全局表放行（无 tenant_id，不涉及租户归属）
  findUnique({ model, args, query }) {
    if (!scoped(model)) {
      return query(args);
    }
    return (query(args) as Promise<{ tenantId?: string } | null>).then((row) =>
      row !== null && row.tenantId !== currentTenantId() ? null : row,
    );
  },
  findFirst({ model, args, query }) {
    if (scoped(model)) {
      withTenantWhere(args);
    }
    return query(args);
  },
  findMany({ model, args, query }) {
    if (scoped(model)) {
      withTenantWhere(args);
    }
    return query(args);
  },
  count({ model, args, query }) {
    if (scoped(model)) {
      withTenantWhere(args);
    }
    return query(args);
  },
  // 聚合与分组统计同样必须带租户条件，否则跨租户汇总会串数据
  aggregate({ model, args, query }) {
    if (scoped(model)) {
      withTenantWhere(args);
    }
    return query(args);
  },
  groupBy({ model, args, query }) {
    if (scoped(model)) {
      withTenantWhere(args);
    }
    return query(args);
  },
  // 写：强制落当前租户
  create({ model, args, query }) {
    if (scoped(model)) {
      withTenantData(args);
    }
    return query(args);
  },
  createMany({ model, args, query }) {
    if (scoped(model)) {
      const a = args as { data?: Record<string, unknown>[] };
      if (Array.isArray(a.data)) {
        a.data = a.data.map((row) => ({ ...row, tenantId: currentTenantId() }));
      }
    }
    return query(args);
  },
  // upsert / update / delete（单数）where 为唯一键，无法复合租户条件 → 业务表一律禁用，
  // 由 updateMany / deleteMany 承接（其 where 可带 AND 注入租户条件）
  upsert({ model, args, query }) {
    if (!scoped(model)) {
      return query(args);
    }
    throw new Error(
      '[prisma-tenant] upsert 已禁用：where 为唯一键无法附加租户条件；请改为 findFirst 校验后 create / updateMany',
    );
  },
  update({ model, args, query }) {
    if (!scoped(model)) {
      return query(args);
    }
    throw new Error(
      '[prisma-tenant] 单数 update 已禁用：where 为唯一键无法附加租户条件；请改用 updateMany',
    );
  },
  updateMany({ model, args, query }) {
    if (scoped(model)) {
      withTenantWhere(args);
      stripTenantMutation(args);
    }
    return query(args);
  },
  delete({ model, args, query }) {
    if (!scoped(model)) {
      return query(args);
    }
    throw new Error(
      '[prisma-tenant] 单数 delete 已禁用：where 为唯一键无法附加租户条件；请改用 deleteMany',
    );
  },
  deleteMany({ model, args, query }) {
    if (scoped(model)) {
      withTenantWhere(args);
    }
    return query(args);
  },
};

export const tenantExtension = Prisma.defineExtension({
  name: 'tenant',
  query: { $allModels: hooks },
} as never);
