import { Injectable } from '@nestjs/common';
import { Prisma } from '@mcc/db';
import { hash } from '@node-rs/argon2';
import {
  isOverQuota,
  PLATFORM_ROLE_LABELS,
  type PlatformRole,
  type PlatformUserCreateInput,
  type PlatformUserListQuery,
  type PlatformUserResetPasswordInput,
  type PlatformUserStatusInput,
  type TenantAccountCountsQuery,
  type TenantAdminCreateInput,
  type TenantAdminPhoneInput,
  type TenantAdminResetPasswordInput,
} from '@mcc/shared';
import { problem } from '../../common/http-problem.js';
import { PrismaService } from '../../common/prisma.service.js';
import { runWithTenant, TenantService } from '../tenant/index.js';
import type {
  PlatformUserDto,
  PlatformUserListDto,
  TenantAccountCountDto,
  TenantAdminDto,
  TenantAdminListDto,
} from './dto/platform-user.dto.js';

const ACTIVE = 'ACTIVE';
const INACTIVE = 'INACTIVE';

type PlatformUserRow = {
  id: string;
  username: string;
  role: string;
  status: string;
  createdAt: Date;
};

const toPlatformUserDto = (row: PlatformUserRow): PlatformUserDto => ({
  id: row.id,
  username: row.username,
  role: row.role,
  roleLabel: PLATFORM_ROLE_LABELS[row.role as PlatformRole] ?? row.role,
  status: row.status === ACTIVE ? 'active' : 'inactive',
  createdAt: row.createdAt.toISOString(),
});

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const isPhoneViolation = (error: unknown): boolean => {
  if (!isUniqueViolation(error)) {
    return false;
  }
  const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  return fields.some((field) => field.includes('phone'));
};

// 平台账号与租户管理员账号（design/账号与权限.md §3）：
// 平台账号归 platform_users；租户管理员操作在目标租户作用域内执行（runWithTenant），不代登录。
// 账号数为未删除账号数（含停用），平台账号不计入。
@Injectable()
export class PlatformUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
  ) {}

  // ── 平台运营账号（/ops/accounts）─────────────────────────────────

  async listPlatformUsers(query: PlatformUserListQuery): Promise<PlatformUserListDto> {
    const where: Prisma.PlatformUserWhereInput = {};
    if (query.keyword) {
      where.username = { contains: query.keyword, mode: 'insensitive' };
    }
    const [total, rows] = await Promise.all([
      this.prisma.client.platformUser.count({ where }),
      this.prisma.client.platformUser.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: { id: true, username: true, role: true, status: true, createdAt: true },
      }),
    ]);
    return { total, items: rows.map(toPlatformUserDto) };
  }

  async createPlatformUser(input: PlatformUserCreateInput): Promise<PlatformUserDto> {
    try {
      const created = await this.prisma.client.platformUser.create({
        data: {
          username: input.username,
          passwordHash: await hash(input.password),
          role: input.role,
          status: ACTIVE,
        },
        select: { id: true, username: true, role: true, status: true, createdAt: true },
      });
      return toPlatformUserDto(created);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw problem(409, 'USERNAME_TAKEN', '平台账号已存在');
      }
      throw error;
    }
  }

  async setPlatformUserStatus(
    id: string,
    input: PlatformUserStatusInput,
    actorId: string,
  ): Promise<PlatformUserDto> {
    const target = await this.findPlatformUser(id);
    if (input.status === 'inactive') {
      if (target.id === actorId) {
        throw problem(400, 'SELF_INACTIVE', '不能停用自己');
      }
      await this.assertNotLastPlatformAdmin(target);
    }
    await this.prisma.client.platformUser.update({
      where: { id },
      data: { status: input.status === 'active' ? ACTIVE : INACTIVE },
    });
    if (input.status === 'inactive') {
      await this.revokePlatformTokens(id);
    }
    return this.reloadPlatformUser(id);
  }

  async resetPlatformUserPassword(
    id: string,
    input: PlatformUserResetPasswordInput,
  ): Promise<void> {
    await this.findPlatformUser(id);
    await this.prisma.client.platformUser.update({
      where: { id },
      data: { passwordHash: await hash(input.password) },
    });
    await this.revokePlatformTokens(id);
  }

  // ── 跨租户账号数据（/ops/tenant-account-counts、/ops/tenants/:tenantId/admins）──

  async tenantAccountCounts(query: TenantAccountCountsQuery): Promise<{ items: TenantAccountCountDto[] }> {
    const tenantIds = [
      ...new Set(
        query.tenantIds
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ].slice(0, 200);

    const items = await Promise.all(
      tenantIds.map(async (tenantId) => ({
        tenantId,
        accountCount: await runWithTenant(tenantId, async () => {
          return this.prisma.client.user.count({ where: { deletedAt: null } });
        }),
      })),
    );
    return { items };
  }

  async tenantAdmins(tenantId: string): Promise<TenantAdminListDto> {
    await this.requireTenant(tenantId);
    const rows = await runWithTenant(tenantId, async () => {
      return this.prisma.client.user.findMany({
        where: { role: 'ADMIN', deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, username: true, phone: true, status: true, createdAt: true },
      });
    });
    const items: TenantAdminDto[] = rows.map((row) => ({
      id: row.id,
      username: row.username,
      phone: row.phone,
      status: row.status === ACTIVE ? 'active' : 'inactive',
      createdAt: row.createdAt.toISOString(),
    }));
    return { total: items.length, items };
  }

  async createTenantAdmin(
    tenantId: string,
    input: TenantAdminCreateInput,
  ): Promise<TenantAdminDto> {
    const tenant = await this.requireTenant(tenantId);
    try {
      const created = await runWithTenant(tenantId, async () => {
        await this.assertQuotaWithinTenant(tenant.id);
        return this.prisma.client.user.create({
          data: {
            tenantId: tenant.id,
            username: input.username,
            phone: input.phone,
            passwordHash: await hash(input.password),
            role: 'ADMIN',
            status: ACTIVE,
            mustChangePassword: true,
          },
          select: { id: true, username: true, phone: true, status: true, createdAt: true },
        });
      });
      return {
        id: created.id,
        username: created.username,
        phone: created.phone,
        status: created.status === ACTIVE ? 'active' : 'inactive',
        createdAt: created.createdAt.toISOString(),
      };
    } catch (error) {
      if (isPhoneViolation(error)) {
        throw problem(409, 'PHONE_TAKEN', '手机号已被使用');
      }
      if (isUniqueViolation(error)) {
        throw problem(409, 'USERNAME_TAKEN', '姓名已存在');
      }
      throw error;
    }
  }

  async updateTenantAdminPhone(
    tenantId: string,
    userId: string,
    input: TenantAdminPhoneInput,
  ): Promise<void> {
    await this.requireTenant(tenantId);
    await runWithTenant(tenantId, async () => {
      const target = await this.prisma.client.user.findFirst({
        where: { id: userId, role: 'ADMIN', deletedAt: null },
        select: { id: true },
      });
      if (!target) {
        throw problem(404, 'NOT_FOUND', '租户管理员不存在');
      }
      try {
        await this.prisma.client.user.updateMany({
          where: { id: userId },
          data: { phone: input.phone },
        });
      } catch (error) {
        if (isPhoneViolation(error)) {
          throw problem(409, 'PHONE_TAKEN', '手机号已被使用');
        }
        throw error;
      }
      await this.prisma.client.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  async resetTenantAdminPassword(
    tenantId: string,
    userId: string,
    input: TenantAdminResetPasswordInput,
  ): Promise<void> {
    await this.requireTenant(tenantId);
    await runWithTenant(tenantId, async () => {
      const target = await this.prisma.client.user.findFirst({
        where: { id: userId, role: 'ADMIN', deletedAt: null },
        select: { id: true },
      });
      if (!target) {
        throw problem(404, 'NOT_FOUND', '租户管理员不存在');
      }
      await this.prisma.client.user.updateMany({
        where: { id: userId },
        data: {
          passwordHash: await hash(input.password),
          mustChangePassword: true,
        },
      });
      await this.prisma.client.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  // ── 内部 ─────────────────────────────────────────────────────────

  private async requireTenant(tenantId: string): Promise<{ id: string; code: string; name: string }> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) {
      throw problem(404, 'NOT_FOUND', '租户不存在');
    }
    return { id: tenant.id, code: tenant.code, name: tenant.name };
  }

  // 额度口径：未删除账号数（含停用）；平台账号不计入（design/租户.md §3）。
  // 新建后账号数将超过额度即拒绝。
  private async assertQuotaWithinTenant(tenantId: string): Promise<void> {
    const [accountCount, maxAccounts] = await Promise.all([
      this.prisma.client.user.count({ where: { deletedAt: null } }),
      this.tenants.getQuota(tenantId),
    ]);
    if (isOverQuota(accountCount + 1, maxAccounts)) {
      throw problem(
        409,
        'QUOTA_EXCEEDED',
        `账号数已达套餐上限（${maxAccounts}），请联系平台运营调整套餐`,
      );
    }
  }

  private async findPlatformUser(id: string): Promise<PlatformUserRow> {
    const target = await this.prisma.client.platformUser.findUnique({
      where: { id },
      select: { id: true, username: true, role: true, status: true, createdAt: true },
    });
    if (!target) {
      throw problem(404, 'NOT_FOUND', '平台账号不存在');
    }
    return target;
  }

  private async reloadPlatformUser(id: string): Promise<PlatformUserDto> {
    const row = await this.prisma.client.platformUser.findFirst({
      where: { id },
      select: { id: true, username: true, role: true, status: true, createdAt: true },
    });
    if (!row) {
      throw problem(404, 'NOT_FOUND', '平台账号不存在');
    }
    return toPlatformUserDto(row);
  }

  private async assertNotLastPlatformAdmin(target: {
    role: string;
    status: string;
  }): Promise<void> {
    if (target.role !== 'PLATFORM_ADMIN' || target.status !== ACTIVE) {
      return;
    }
    const activeAdmins = await this.prisma.client.platformUser.count({
      where: { role: 'PLATFORM_ADMIN', status: ACTIVE },
    });
    if (activeAdmins <= 1) {
      throw problem(400, 'LAST_ADMIN', '至少保留一个启用状态的平台管理员');
    }
  }

  private async revokePlatformTokens(platformUserId: string): Promise<void> {
    await this.prisma.client.platformRefreshToken.updateMany({
      where: { platformUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
