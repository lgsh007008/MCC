import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@mcc/db';
import {
  BASE_FEATURES,
  diffFeatures,
  isFeatureCode,
  normalizeOverrides,
  resolveEffectiveFeatures,
  type FeatureCode,
  type PlanCreateInput,
  type PlanStatusInput,
  type PlanUpdateInput,
  type TenantCreateInput,
  type TenantFeaturesInput,
  type TenantListQuery,
  type TenantPlanInput,
  type TenantStatusInput,
  type TenantUpdateInput,
} from '@mcc/shared';
import { problem } from '../../common/http-problem.js';
import { PrismaService } from '../../common/prisma.service.js';
import { RedisService } from '../../common/redis.service.js';
import type {
  TenantDetailDto,
  TenantListItemDto,
  TenantListDto,
  TenantPlanChangeDto,
} from './dto/tenant.dto.js';
import type { PlanDto, PlanListDto } from './dto/plan.dto.js';

// 租户领域服务（design/租户.md §1、§3–§6）：
// tenants / plans / plan_features / tenant_features 四张全局表归本模块；
// 不读写业务表、不导入 auth（账号数与管理员账号由前端经 auth 公开接口组合）。

const FEATURE_CACHE_TTL_SECONDS = 60;
const featureCacheKey = (tenantId: string): string => `tenant:features:${tenantId}`;

export interface TenantSummary {
  id: string;
  code: string;
  name: string;
  planId: string;
  status: 'active' | 'suspended';
  sessionEpoch: number;
  maxAccounts: number;
}

type TenantRow = {
  id: string;
  code: string;
  name: string;
  planId: string;
  status: string;
  sessionEpoch: number;
  note: string;
  createdAt: Date;
  plan: { id: string; name: string; maxAccounts: number };
};

type PlanRow = {
  id: string;
  name: string;
  maxAccounts: number;
  status: string;
  note: string;
  createdAt: Date;
  features: { featureCode: string }[];
  _count?: { tenants: number };
};

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const toPlanDto = (row: PlanRow): PlanDto => ({
  id: row.id,
  name: row.name,
  maxAccounts: row.maxAccounts,
  status: row.status === 'ACTIVE' ? 'active' : 'inactive',
  featureCodes: row.features.map((item) => item.featureCode),
  note: row.note,
  tenantCount: row._count?.tenants ?? 0,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── 公开接口（供 auth 与平台守卫使用，design/租户.md §5）─────────────

  async findByCode(code: string): Promise<TenantSummary | null> {
    const row = await this.prisma.client.tenant.findUnique({
      where: { code },
      include: { plan: { select: { maxAccounts: true } } },
    });
    return row ? this.toSummary(row) : null;
  }

  async findById(id: string): Promise<TenantSummary | null> {
    const row = await this.prisma.client.tenant.findUnique({
      where: { id },
      include: { plan: { select: { maxAccounts: true } } },
    });
    return row ? this.toSummary(row) : null;
  }

  /** 校验租户存在且启用（AuthGuard 每次请求消费；停用即时拒绝） */
  async assertActiveById(id: string): Promise<TenantSummary> {
    const tenant = await this.findById(id);
    if (!tenant) {
      throw problem(401, 'TOKEN_INVALID', '登录状态已失效，请重新登录');
    }
    if (tenant.status !== 'active') {
      throw problem(401, 'TENANT_SUSPENDED', '租户已停用，请联系平台运营');
    }
    return tenant;
  }

  async getQuota(tenantId: string): Promise<number> {
    const tenant = await this.findById(tenantId);
    if (!tenant) {
      throw problem(404, 'NOT_FOUND', '租户不存在');
    }
    return tenant.maxAccounts;
  }

  /** 有效功能 = 基础功能 ∪ 套餐功能 + 租户加购 − 租户关闭；带 60 秒短缓存 */
  async getEffectiveFeatures(tenantId: string): Promise<FeatureCode[]> {
    const key = featureCacheKey(tenantId);
    const cached = await this.redis.get(key);
    if (cached) {
      try {
        const parsed: unknown = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          return parsed.filter(isFeatureCode);
        }
      } catch {
        // 缓存损坏按未命中处理
      }
    }

    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      include: {
        plan: { include: { features: { select: { featureCode: true } } } },
        featureOverrides: { select: { featureCode: true, enabled: true } },
      },
    });
    if (!tenant) {
      return [...BASE_FEATURES];
    }
    const effective = resolveEffectiveFeatures(
      tenant.plan.features.map((item) => item.featureCode),
      tenant.featureOverrides,
    );
    await this.redis.set(key, JSON.stringify(effective), 'EX', FEATURE_CACHE_TTL_SECONDS);
    return effective;
  }

  async assertFeature(tenantId: string, featureCode: FeatureCode): Promise<void> {
    const features = await this.getEffectiveFeatures(tenantId);
    if (!features.includes(featureCode)) {
      throw problem(403, 'FEATURE_DISABLED', '当前套餐未开通该功能，请联系平台运营');
    }
  }

  // ── 租户管理（/ops/tenants）────────────────────────────────────────

  async list(query: TenantListQuery): Promise<TenantListDto> {
    const where: Prisma.TenantWhereInput = {};
    if (query.code) {
      where.code = { contains: query.code, mode: 'insensitive' };
    }
    if (query.name) {
      where.name = { contains: query.name, mode: 'insensitive' };
    }
    if (query.status) {
      where.status = query.status === 'active' ? 'ACTIVE' : 'SUSPENDED';
    }
    if (query.planId) {
      where.planId = query.planId;
    }

    const [total, rows] = await Promise.all([
      this.prisma.client.tenant.count({ where }),
      this.prisma.client.tenant.findMany({
        where,
        include: { plan: { select: { id: true, name: true, maxAccounts: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      total,
      items: rows.map((row): TenantListItemDto => ({
        id: row.id,
        code: row.code,
        name: row.name,
        planId: row.planId,
        planName: row.plan.name,
        status: row.status === 'ACTIVE' ? 'active' : 'suspended',
        maxAccounts: row.plan.maxAccounts,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async detail(id: string): Promise<TenantDetailDto> {
    return this.detailOf(id);
  }

  async create(input: TenantCreateInput): Promise<TenantDetailDto> {
    const plan = await this.prisma.client.plan.findUnique({ where: { id: input.planId } });
    if (!plan) {
      throw problem(400, 'PLAN_NOT_FOUND', '套餐不存在');
    }
    if (plan.status !== 'ACTIVE') {
      throw problem(400, 'PLAN_INACTIVE', '套餐已停用，不能用于开通租户');
    }

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const created = await this.prisma.client.$transaction(async (tx) => {
          // 事务内取 TN- 前缀最大流水 + 1；唯一约束兜底并发冲突（design/租户.md §4）
          const latest = await tx.tenant.findFirst({
            where: { code: { startsWith: 'TN-' } },
            orderBy: { code: 'desc' },
            select: { code: true },
          });
          const nextNumber = latest
            ? Number.parseInt(latest.code.slice('TN-'.length), 10) + 1
            : 1;
          return tx.tenant.create({
            data: {
              code: `TN-${String(nextNumber).padStart(5, '0')}`,
              name: input.name,
              planId: input.planId,
              note: input.note,
            },
          });
        });
        return this.detailOf(created.id);
      } catch (error) {
        if (isUniqueViolation(error)) {
          if (attempt < maxAttempts - 1) {
            continue;
          }
          throw problem(409, 'TENANT_CODE_CONFLICT', '租户编号生成冲突，请重试');
        }
        throw error;
      }
    }
    throw problem(409, 'TENANT_CODE_CONFLICT', '租户编号生成冲突，请重试');
  }

  async update(id: string, input: TenantUpdateInput): Promise<TenantDetailDto> {
    await this.requireTenant(id);
    await this.prisma.client.tenant.update({
      where: { id },
      data: { name: input.name, note: input.note },
    });
    return this.detailOf(id);
  }

  // 停用：epoch + 1，旧访问 / 刷新令牌立即失效；启用不重置 epoch，账号需重新登录。
  async setStatus(id: string, input: TenantStatusInput): Promise<TenantDetailDto> {
    const tenant = await this.requireTenant(id);
    const target = input.status === 'active' ? 'ACTIVE' : 'SUSPENDED';
    if (tenant.status !== target) {
      await this.prisma.client.tenant.update({
        where: { id },
        data:
          target === 'SUSPENDED'
            ? { status: 'SUSPENDED', sessionEpoch: { increment: 1 } }
            : { status: 'ACTIVE' },
      });
      await this.invalidateFeatureCache(id);
    }
    return this.detailOf(id);
  }

  async changePlan(id: string, input: TenantPlanInput): Promise<TenantPlanChangeDto> {
    await this.requireTenant(id);
    const plan = await this.prisma.client.plan.findUnique({ where: { id: input.planId } });
    if (!plan) {
      throw problem(400, 'PLAN_NOT_FOUND', '套餐不存在');
    }
    if (plan.status !== 'ACTIVE') {
      throw problem(400, 'PLAN_INACTIVE', '套餐已停用，不能切换');
    }

    const before = await this.getEffectiveFeatures(id);
    await this.prisma.client.tenant.update({ where: { id }, data: { planId: input.planId } });
    await this.invalidateFeatureCache(id);
    const after = await this.getEffectiveFeatures(id);
    const diff = diffFeatures(before, after);

    return {
      planId: plan.id,
      planName: plan.name,
      maxAccounts: plan.maxAccounts,
      effectiveFeatures: after,
      added: diff.added,
      removed: diff.removed,
    };
  }

  // 全量提交覆盖项：只存与套餐不同的偏差（normalizeOverrides），保存后失效缓存。
  async setFeatures(id: string, input: TenantFeaturesInput): Promise<TenantDetailDto> {
    const tenant = await this.requireTenant(id);
    const planFeatures = await this.prisma.client.planFeature.findMany({
      where: { planId: tenant.planId },
      select: { featureCode: true },
    });
    const normalized = normalizeOverrides(
      planFeatures.map((item) => item.featureCode),
      input.overrides,
    );

    await this.prisma.client.$transaction(async (tx) => {
      await tx.tenantFeature.deleteMany({ where: { tenantId: id } });
      if (normalized.length > 0) {
        await tx.tenantFeature.createMany({
          data: normalized.map((item) => ({
            tenantId: id,
            featureCode: item.featureCode,
            enabled: item.enabled,
          })),
        });
      }
    });

    await this.invalidateFeatureCache(id);
    return this.detailOf(id);
  }

  // ── 套餐管理（/ops/plans）──────────────────────────────────────────

  async listPlans(): Promise<PlanListDto> {
    const [total, rows] = await Promise.all([
      this.prisma.client.plan.count(),
      this.prisma.client.plan.findMany({
        include: {
          features: { select: { featureCode: true }, orderBy: { featureCode: 'asc' } },
          _count: { select: { tenants: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return { total, items: rows.map(toPlanDto) };
  }

  async createPlan(input: PlanCreateInput): Promise<PlanDto> {
    try {
      const created = await this.prisma.client.$transaction(async (tx) => {
        const plan = await tx.plan.create({
          data: {
            name: input.name,
            maxAccounts: input.maxAccounts,
            note: input.note,
          },
        });
        if (input.featureCodes.length > 0) {
          await tx.planFeature.createMany({
            data: input.featureCodes.map((code) => ({ planId: plan.id, featureCode: code })),
          });
        }
        return plan;
      });
      return this.planDto(created.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw problem(409, 'PLAN_NAME_TAKEN', '套餐名称已存在');
      }
      throw error;
    }
  }

  async updatePlan(id: string, input: PlanUpdateInput): Promise<PlanDto> {
    await this.requirePlan(id);
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.plan.update({
          where: { id },
          data: { name: input.name, maxAccounts: input.maxAccounts, note: input.note },
        });
        await tx.planFeature.deleteMany({ where: { planId: id } });
        if (input.featureCodes.length > 0) {
          await tx.planFeature.createMany({
            data: input.featureCodes.map((code) => ({ planId: id, featureCode: code })),
          });
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw problem(409, 'PLAN_NAME_TAKEN', '套餐名称已存在');
      }
      throw error;
    }

    // 套餐功能变化影响该套餐下全部租户的有效功能
    await this.invalidatePlanFeatureCache(id);
    return this.planDto(id);
  }

  async setPlanStatus(id: string, input: PlanStatusInput): Promise<PlanDto> {
    await this.requirePlan(id);
    await this.prisma.client.plan.update({
      where: { id },
      data: { status: input.status === 'active' ? 'ACTIVE' : 'INACTIVE' },
    });
    return this.planDto(id);
  }

  // ── 内部 ───────────────────────────────────────────────────────────

  private toSummary(row: {
    id: string;
    code: string;
    name: string;
    planId: string;
    status: string;
    sessionEpoch: number;
    plan: { maxAccounts: number };
  }): TenantSummary {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      planId: row.planId,
      status: row.status === 'ACTIVE' ? 'active' : 'suspended',
      sessionEpoch: row.sessionEpoch,
      maxAccounts: row.plan.maxAccounts,
    };
  }

  private async requireTenant(id: string): Promise<TenantRow> {
    const row = await this.prisma.client.tenant.findUnique({
      where: { id },
      include: { plan: { select: { id: true, name: true, maxAccounts: true } } },
    });
    if (!row) {
      throw problem(404, 'NOT_FOUND', '租户不存在');
    }
    return row;
  }

  private async requirePlan(id: string): Promise<{ id: string }> {
    const plan = await this.prisma.client.plan.findUnique({ where: { id }, select: { id: true } });
    if (!plan) {
      throw problem(404, 'NOT_FOUND', '套餐不存在');
    }
    return plan;
  }

  private async detailOf(id: string): Promise<TenantDetailDto> {
    const row = await this.prisma.client.tenant.findUnique({
      where: { id },
      include: {
        plan: { include: { features: { select: { featureCode: true } } } },
        featureOverrides: { orderBy: { featureCode: 'asc' } },
      },
    });
    if (!row) {
      throw problem(404, 'NOT_FOUND', '租户不存在');
    }
    const overrides = row.featureOverrides.map((item) => ({
      featureCode: item.featureCode,
      enabled: item.enabled,
    }));
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      planId: row.planId,
      planName: row.plan.name,
      status: row.status === 'ACTIVE' ? 'active' : 'suspended',
      maxAccounts: row.plan.maxAccounts,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      effectiveFeatures: resolveEffectiveFeatures(
        row.plan.features.map((item) => item.featureCode),
        overrides,
      ),
      overrides,
    };
  }

  private async planDto(id: string): Promise<PlanDto> {
    const row = await this.prisma.client.plan.findUnique({
      where: { id },
      include: {
        features: { select: { featureCode: true }, orderBy: { featureCode: 'asc' } },
        _count: { select: { tenants: true } },
      },
    });
    if (!row) {
      throw problem(404, 'NOT_FOUND', '套餐不存在');
    }
    return toPlanDto(row);
  }

  private async invalidateFeatureCache(tenantId: string): Promise<void> {
    try {
      await this.redis.del(featureCacheKey(tenantId));
    } catch (error) {
      // 缓存失效失败由 TTL 兜底，不影响主流程
      this.logger.warn(
        `租户功能缓存失效失败 ${tenantId}：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async invalidatePlanFeatureCache(planId: string): Promise<void> {
    const tenants = await this.prisma.client.tenant.findMany({
      where: { planId },
      select: { id: true },
    });
    if (tenants.length === 0) {
      return;
    }
    try {
      await this.redis.del(...tenants.map((tenant) => featureCacheKey(tenant.id)));
    } catch (error) {
      this.logger.warn(
        `套餐功能缓存失效失败 ${planId}：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
