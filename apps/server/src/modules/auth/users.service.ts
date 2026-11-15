import { Injectable } from '@nestjs/common';
import { Prisma } from '@mcc/db';
import { hash } from '@node-rs/argon2';
import type {
  UserCreateInput,
  UserListQuery,
  UserResetPasswordInput,
  UserRoleInput,
  UserStatusInput,
} from '@mcc/shared';
import { isOverQuota, ROLE_LABELS, type UserRole } from '@mcc/shared';
import { problem } from '../../common/http-problem.js';
import { currentTenantId } from '../../common/prisma-tenant.extension.js';
import { PrismaService } from '../../common/prisma.service.js';
import { TenantService } from '../tenant/index.js';
import type { UserDto, UserListDto } from './dto/user.dto.js';

// 账号管理（design/账号与权限.md §2、§3）：
// user 表归 auth 模块；本服务只做账号 CRUD 与管理员保护，权限由控制器 @RequireScopes 控制。

const ACTIVE = 'ACTIVE';
const INACTIVE = 'INACTIVE';

type UserRow = {
  id: string;
  username: string;
  role: string;
  status: string;
  createdAt: Date;
};

const toDto = (row: UserRow): UserDto => ({
  id: row.id,
  username: row.username,
  role: row.role as UserRole,
  roleLabel: ROLE_LABELS[row.role as UserRole] ?? row.role,
  status: row.status === ACTIVE ? 'active' : 'inactive',
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
  ) {}

  async list(query: UserListQuery): Promise<UserListDto> {
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (query.keyword) {
      where.username = { contains: query.keyword, mode: 'insensitive' };
    }
    const [total, rows, used, maxAccounts] = await Promise.all([
      this.prisma.client.user.count({ where }),
      this.prisma.client.user.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: { id: true, username: true, role: true, status: true, createdAt: true },
      }),
      // 额度口径：未删除账号数（含停用），与筛选无关
      this.prisma.client.user.count({ where: { deletedAt: null } }),
      this.tenants.getQuota(currentTenantId()),
    ]);
    return { total, items: rows.map(toDto), quota: { used, maxAccounts } };
  }

  async create(input: UserCreateInput): Promise<UserDto> {
    await this.assertQuota();
    const existing = await this.prisma.client.user.findFirst({
      where: { username: input.username },
      select: { id: true, deletedAt: true },
    });
    if (existing && existing.deletedAt === null) {
      throw problem(409, 'USERNAME_TAKEN', '账号已存在');
    }
    try {
      const created = await this.prisma.client.user.create({
        data: {
          tenantId: currentTenantId(),
          username: input.username,
          passwordHash: await hash(input.password),
          role: input.role,
          status: ACTIVE,
        },
        select: { id: true, username: true, role: true, status: true, createdAt: true },
      });
      return toDto(created);
    } catch (error) {
      // 并发创建时唯一约束兜底
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw problem(409, 'USERNAME_TAKEN', '账号已存在');
      }
      throw error;
    }
  }

  async setStatus(id: string, input: UserStatusInput, actorId: string): Promise<UserDto> {
    const target = await this.findTarget(id);
    if (input.status === 'inactive') {
      if (target.id === actorId) {
        throw problem(400, 'SELF_INACTIVE', '不能停用自己');
      }
      await this.assertNotLastAdmin(target);
    }
    const result = await this.prisma.client.user.updateMany({
      where: { id },
      data: { status: input.status === 'active' ? ACTIVE : INACTIVE },
    });
    if (result.count === 0) {
      throw problem(404, 'NOT_FOUND', '账号不存在');
    }
    if (input.status === 'inactive') {
      await this.revokeRefreshTokens(id);
    }
    return this.reload(id);
  }

  async setRole(id: string, input: UserRoleInput): Promise<UserDto> {
    const target = await this.findTarget(id);
    // 防竞态：事务内更新并复查管理员数量
    await this.prisma.client.$transaction(async (tx) => {
      if (target.role === 'ADMIN' && input.role !== 'ADMIN') {
        const activeAdmins = await tx.user.count({
          where: { role: 'ADMIN', status: ACTIVE, deletedAt: null },
        });
        if (activeAdmins <= 1) {
          throw problem(400, 'LAST_ADMIN', '至少保留一个启用状态的管理员');
        }
      }
      const result = await tx.user.updateMany({
        where: { id },
        data: { role: input.role },
      });
      if (result.count === 0) {
        throw problem(404, 'NOT_FOUND', '账号不存在');
      }
    });
    await this.revokeRefreshTokens(id);
    return this.reload(id);
  }

  async resetPassword(id: string, input: UserResetPasswordInput): Promise<void> {
    await this.findTarget(id);
    const result = await this.prisma.client.user.updateMany({
      where: { id },
      data: { passwordHash: await hash(input.password) },
    });
    if (result.count === 0) {
      throw problem(404, 'NOT_FOUND', '账号不存在');
    }
    await this.revokeRefreshTokens(id);
  }

  private async findTarget(id: string): Promise<{ id: string; role: string; status: string }> {
    const target = await this.prisma.client.user.findUnique({
      where: { id },
      select: { id: true, tenantId: true, role: true, status: true, deletedAt: true },
    });
    if (!target || target.deletedAt !== null) {
      throw problem(404, 'NOT_FOUND', '账号不存在');
    }
    return target;
  }

  // 额度校验（design/租户.md §3 / design/账号与权限.md §6）：
  // 新建后账号数（未删除，含停用）将超过套餐额度即拒绝；平台账号不在本表，天然不计入。
  private async assertQuota(): Promise<void> {
    const [accountCount, maxAccounts] = await Promise.all([
      this.prisma.client.user.count({ where: { deletedAt: null } }),
      this.tenants.getQuota(currentTenantId()),
    ]);
    if (isOverQuota(accountCount + 1, maxAccounts)) {
      throw problem(
        409,
        'QUOTA_EXCEEDED',
        `账号数已达套餐上限（${maxAccounts}），请联系平台运营调整套餐`,
      );
    }
  }

  private async reload(id: string): Promise<UserDto> {
    const row = await this.prisma.client.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, username: true, role: true, status: true, createdAt: true },
    });
    if (!row) {
      throw problem(404, 'NOT_FOUND', '账号不存在');
    }
    return toDto(row);
  }

  private async assertNotLastAdmin(target: { role: string; status: string }): Promise<void> {
    if (target.role !== 'ADMIN' || target.status !== ACTIVE) {
      return;
    }
    const activeAdmins = await this.prisma.client.user.count({
      where: { role: 'ADMIN', status: ACTIVE, deletedAt: null },
    });
    if (activeAdmins <= 1) {
      throw problem(400, 'LAST_ADMIN', '至少保留一个启用状态的管理员');
    }
  }

  private async revokeRefreshTokens(userId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
