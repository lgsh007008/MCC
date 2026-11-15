import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { ChangePasswordInput, PlatformLoginInput, PlatformRole } from '@mcc/shared';
import { isPlatformRole } from '@mcc/shared';
import { hash as hashPassword, verify as verifyPassword } from '@node-rs/argon2';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { problem } from '../../common/http-problem.js';
import { PrismaService } from '../../common/prisma.service.js';
import { RedisService } from '../../common/redis.service.js';
import type { PlatformAuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  LOGIN_FAIL_LIMIT,
  LOGIN_FAIL_LOCK_SECONDS,
  PLATFORM_TOKEN_AUDIENCE,
  platformLoginFailKey,
  REFRESH_REMEMBER_TTL_DAYS,
  REFRESH_SESSION_TTL_DAYS,
} from './auth.constants.js';

export interface PlatformLoginResult {
  userId: string;
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
  username: string;
  role: PlatformRole;
}

export interface PlatformLogoutResult {
  userId: string;
  username: string;
  role: PlatformRole;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

// 平台运营身份认证（design/账号与权限.md §6）：
// 与租户身份是两条独立流水线——独立表、独立受众（aud = ops）、独立 Cookie、独立失败计数。
@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async login(input: PlatformLoginInput): Promise<PlatformLoginResult> {
    const failKey = platformLoginFailKey(input.username);
    await this.assertNotLocked(failKey);

    const user = await this.prisma.client.platformUser.findFirst({
      where: { username: input.username },
    });
    const passwordOk = user ? await verifyPassword(user.passwordHash, input.password) : false;
    if (!user || !passwordOk) {
      await this.recordFailure(failKey);
      throw problem(401, 'INVALID_CREDENTIALS', '账号或密码错误');
    }
    if (user.status !== 'ACTIVE') {
      throw problem(401, 'ACCOUNT_INACTIVE', '平台账号已停用，请联系其他平台管理员');
    }

    await this.redis.del(failKey);

    const rememberMe = input.rememberMe;
    const ttlDays = rememberMe ? REFRESH_REMEMBER_TTL_DAYS : REFRESH_SESSION_TTL_DAYS;
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.client.platformRefreshToken.create({
      data: {
        tokenHash: sha256(refreshToken),
        platformUserId: user.id,
        expiresAt: new Date(Date.now() + ttlDays * DAY_MS),
      },
    });

    return {
      userId: user.id,
      accessToken: this.signAccessToken(user),
      refreshToken,
      rememberMe,
      username: user.username,
      role: user.role,
    };
  }

  async refresh(refreshToken: string | undefined): Promise<{ accessToken: string }> {
    if (!refreshToken) {
      throw problem(401, 'TOKEN_MISSING', '缺少刷新令牌');
    }
    const record = await this.prisma.client.platformRefreshToken.findFirst({
      where: { tokenHash: sha256(refreshToken) },
      include: { platformUser: true },
    });
    if (
      !record ||
      record.revokedAt !== null ||
      record.expiresAt <= new Date() ||
      record.platformUser.status !== 'ACTIVE'
    ) {
      throw problem(401, 'TOKEN_INVALID', '刷新令牌无效或已过期');
    }
    return { accessToken: this.signAccessToken(record.platformUser) };
  }

  async logout(refreshToken: string | undefined): Promise<PlatformLogoutResult | null> {
    if (!refreshToken) {
      return null;
    }
    const record = await this.prisma.client.platformRefreshToken.findFirst({
      where: { tokenHash: sha256(refreshToken) },
      include: { platformUser: true },
    });
    await this.prisma.client.platformRefreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!record) {
      return null;
    }
    return {
      userId: record.platformUser.id,
      username: record.platformUser.username,
      role: record.platformUser.role,
    };
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.prisma.client.platformUser.findFirst({ where: { id: userId } });
    if (!user) {
      throw problem(401, 'UNAUTHORIZED', '登录态无效');
    }
    const passwordOk = await verifyPassword(user.passwordHash, input.oldPassword);
    if (!passwordOk) {
      throw problem(401, 'INVALID_CREDENTIALS', '旧密码不正确');
    }
    await this.prisma.client.platformUser.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    await this.prisma.client.platformRefreshToken.updateMany({
      where: { platformUserId: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  verifyAccessToken(token: string | undefined): PlatformAuthUser {
    if (!token) {
      throw problem(401, 'UNAUTHORIZED', '未登录');
    }
    try {
      const payload = jwt.verify(token, this.jwtSecret(), {
        audience: PLATFORM_TOKEN_AUDIENCE,
      }) as JwtPayload & { username?: string; role?: string };
      if (!payload.sub || typeof payload.username !== 'string' || !isPlatformRole(payload.role)) {
        throw problem(401, 'TOKEN_INVALID', '访问令牌无效');
      }
      return { userId: payload.sub, username: payload.username, role: payload.role };
    } catch {
      throw problem(401, 'TOKEN_INVALID', '访问令牌无效或已过期');
    }
  }

  private signAccessToken(user: {
    id: string;
    username: string;
    role: PlatformRole;
  }): string {
    return jwt.sign({ username: user.username, role: user.role }, this.jwtSecret(), {
      subject: user.id,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      audience: PLATFORM_TOKEN_AUDIENCE,
    });
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
