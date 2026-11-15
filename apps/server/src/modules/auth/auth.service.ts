import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { ChangePasswordInput, LoginInput, UserRole } from '@mcc/shared';
import { isUserRole } from '@mcc/shared';
import { hash as hashPassword, verify as verifyPassword } from '@node-rs/argon2';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { problem } from '../../common/http-problem.js';
import { PrismaService } from '../../common/prisma.service.js';
import { RedisService } from '../../common/redis.service.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { runWithTenant, TenantService, type TenantSummary } from '../tenant/index.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  LOGIN_FAIL_LIMIT,
  LOGIN_FAIL_LOCK_SECONDS,
  loginFailKey,
  REFRESH_REMEMBER_TTL_DAYS,
  REFRESH_SESSION_TTL_DAYS,
  TENANT_TOKEN_AUDIENCE,
} from './auth.constants.js';

export interface LoginResult {
  userId: string;
  tenantId: string;
  tenantCode: string;
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
  username: string;
  role: UserRole;
  // 有效功能（套餐 ∪ 覆盖）：前端菜单按 feature ∩ scope 裁剪（design/账号与权限.md §7）
  features: string[];
}

export interface LogoutResult {
  userId: string;
  tenantId: string;
  username: string;
  role: UserRole;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tenants: TenantService,
  ) {}

  // 登录：租户编号解析租户（不存在 / 停用与凭证错误统一提示）→ 租户作用域内校验账号
  // → Redis 失败计数锁定（5 次 / 15 分钟）→ 签发带租户与 epoch 的双令牌。
  async login(input: LoginInput): Promise<LoginResult> {
    const failKey = loginFailKey(input.tenantCode, input.username);
    await this.assertNotLocked(failKey);

    const tenant = await this.tenants.findByCode(input.tenantCode);
    const active = tenant !== null && tenant.status === 'active';
    const user = active
      ? await runWithTenant(tenant.id, async () => {
          const row = await this.prisma.client.user.findFirst({
            where: { username: input.username, deletedAt: null },
          });
          return row;
        })
      : null;
    const passwordOk = user ? await verifyPassword(user.passwordHash, input.password) : false;

    if (!active || !user || !passwordOk) {
      await this.recordFailure(failKey);
      throw problem(401, 'INVALID_CREDENTIALS', '账号或密码错误');
    }
    if (user.status !== 'ACTIVE') {
      throw problem(401, 'ACCOUNT_INACTIVE', '账号已停用，请联系管理员');
    }

    await this.redis.del(failKey);

    const rememberMe = input.rememberMe;
    const ttlDays = rememberMe ? REFRESH_REMEMBER_TTL_DAYS : REFRESH_SESSION_TTL_DAYS;
    // 刷新令牌前缀携带租户 id，便于刷新 / 登出先定位租户再查表（design/账号与权限.md §4）
    const refreshToken = `${tenant.id}.${randomBytes(32).toString('base64url')}`;
    await runWithTenant(tenant.id, async () => {
      await this.prisma.client.refreshToken.create({
        data: {
          tenantId: tenant.id,
          tokenHash: sha256(refreshToken),
          userId: user.id,
          expiresAt: new Date(Date.now() + ttlDays * DAY_MS),
          tenantEpoch: tenant.sessionEpoch,
        },
      });
    });

    const features = await this.tenants.getEffectiveFeatures(tenant.id);

    return {
      userId: user.id,
      tenantId: tenant.id,
      tenantCode: tenant.code,
      accessToken: this.signAccessToken(user, tenant),
      refreshToken,
      rememberMe,
      username: user.username,
      role: user.role,
      features,
    };
  }

  // 刷新：按令牌前缀定位租户 → 校验租户启用与 epoch → 校验刷新令牌与账号状态 → 签发新访问令牌。
  async refresh(
    refreshToken: string | undefined,
  ): Promise<{ accessToken: string; features: string[] }> {
    if (!refreshToken) {
      throw problem(401, 'TOKEN_MISSING', '缺少刷新令牌');
    }
    const tenantId = this.tenantIdOf(refreshToken);
    if (!tenantId) {
      throw problem(401, 'TOKEN_INVALID', '刷新令牌无效或已过期');
    }
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant || tenant.status !== 'active') {
      throw problem(401, 'TOKEN_INVALID', '刷新令牌无效或已过期');
    }

    const record = await runWithTenant(tenant.id, async () => {
      return this.prisma.client.refreshToken.findFirst({
        where: { tokenHash: sha256(refreshToken) },
        include: { user: true },
      });
    });
    if (
      !record ||
      record.revokedAt !== null ||
      record.expiresAt <= new Date() ||
      record.user.deletedAt !== null ||
      record.user.status !== 'ACTIVE' ||
      // 停用租户后 epoch 递增，旧刷新令牌一律拒绝（design/租户.md §6.2）
      record.tenantEpoch !== tenant.sessionEpoch
    ) {
      throw problem(401, 'TOKEN_INVALID', '刷新令牌无效或已过期');
    }
    return {
      accessToken: this.signAccessToken(record.user, tenant),
      features: await this.tenants.getEffectiveFeatures(tenant.id),
    };
  }

  // 登出：撤销当前刷新令牌（记录保留，供审计）；返回操作者与租户供 controller 记录审计。
  async logout(refreshToken: string | undefined): Promise<LogoutResult | null> {
    if (!refreshToken) {
      return null;
    }
    const tenantId = this.tenantIdOf(refreshToken);
    if (!tenantId) {
      return null;
    }
    const record = await runWithTenant(tenantId, async () => {
      return this.prisma.client.refreshToken.findFirst({
        where: { tokenHash: sha256(refreshToken) },
        include: { user: true },
      });
    });
    await runWithTenant(tenantId, async () => {
      await this.prisma.client.refreshToken.updateMany({
        where: { tokenHash: sha256(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    if (!record || record.user.deletedAt !== null) {
      return null;
    }
    return {
      userId: record.user.id,
      tenantId,
      username: record.user.username,
      role: record.user.role,
    };
  }

  // 修改密码：校验旧密码 → 更新哈希 → 撤销该账号全部刷新会话（其他端需重新登录）。
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt !== null) {
      throw problem(401, 'UNAUTHORIZED', '登录态无效');
    }
    const passwordOk = await verifyPassword(user.passwordHash, input.oldPassword);
    if (!passwordOk) {
      throw problem(401, 'INVALID_CREDENTIALS', '旧密码不正确');
    }
    // 单数 update 无法附加租户条件（where 为唯一键），统一走 updateMany（数据层自动注入租户条件）
    await this.prisma.client.user.updateMany({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    await this.prisma.client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // 访问令牌校验（鉴权守卫经此消费，design/账号与权限.md §6）：
  // 受众必须为 web；载荷必须携带租户与 epoch，否则视为无效。
  verifyAccessToken(token: string | undefined): AuthUser {
    if (!token) {
      throw problem(401, 'UNAUTHORIZED', '未登录');
    }
    try {
      const payload = jwt.verify(token, this.jwtSecret(), {
        audience: TENANT_TOKEN_AUDIENCE,
      }) as JwtPayload & {
        username?: string;
        role?: string;
        tenantId?: string;
        tenantEpoch?: number;
      };
      if (
        !payload.sub ||
        typeof payload.username !== 'string' ||
        !isUserRole(payload.role) ||
        typeof payload.tenantId !== 'string' ||
        typeof payload.tenantEpoch !== 'number'
      ) {
        throw problem(401, 'TOKEN_INVALID', '访问令牌无效');
      }
      return {
        userId: payload.sub,
        username: payload.username,
        role: payload.role,
        tenantId: payload.tenantId,
        tenantEpoch: payload.tenantEpoch,
      };
    } catch {
      throw problem(401, 'TOKEN_INVALID', '访问令牌无效或已过期');
    }
  }

  private signAccessToken(
    user: { id: string; username: string; role: UserRole },
    tenant: TenantSummary,
  ): string {
    return jwt.sign(
      {
        username: user.username,
        role: user.role,
        tenantId: tenant.id,
        tenantEpoch: tenant.sessionEpoch,
      },
      this.jwtSecret(),
      {
        subject: user.id,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        audience: TENANT_TOKEN_AUDIENCE,
      },
    );
  }

  // 刷新令牌格式 `${tenantId}.${random}`；租户 id 为 uuid 或首个租户的历史值 default
  private tenantIdOf(token: string): string | null {
    const index = token.indexOf('.');
    return index > 0 ? token.slice(0, index) : null;
  }

  private async assertNotLocked(failKey: string): Promise<void> {
    const failed = await this.redis.get(failKey);
    if (failed !== null && Number(failed) >= LOGIN_FAIL_LIMIT) {
      const ttl = await this.redis.ttl(failKey);
      throw problem(429, 'AUTH_LOCKED', '连续失败次数过多，账号已锁定 15 分钟，请稍后再试', {
        retryAfterSeconds: ttl > 0 ? ttl : LOGIN_FAIL_LOCK_SECONDS,
      });
    }
  }

  private async recordFailure(failKey: string): Promise<void> {
    const count = await this.redis.incr(failKey);
    if (count === 1) {
      await this.redis.expire(failKey, LOGIN_FAIL_LOCK_SECONDS);
    }
  }

  private jwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('缺少 JWT_SECRET 环境变量（见 apps/server/.env.example）');
    }
    return secret;
  }
}
