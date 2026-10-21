import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { ChangePasswordInput, LoginInput } from '@mcc/shared';
import { hash as hashPassword, verify as verifyPassword } from '@node-rs/argon2';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { problem } from '../../common/http-problem.js';
import { PrismaService } from '../../common/prisma.service.js';
import { RedisService } from '../../common/redis.service.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  LOGIN_FAIL_LIMIT,
  LOGIN_FAIL_LOCK_SECONDS,
  loginFailKey,
  REFRESH_REMEMBER_TTL_DAYS,
  REFRESH_SESSION_TTL_DAYS,
} from './auth.constants.js';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
  username: string;
  role: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // 登录：凭证校验 → Redis 失败计数锁定（5 次 / 15 分钟）→ 签发双令牌。
  async login(input: LoginInput): Promise<LoginResult> {
    const failKey = loginFailKey(input.username);

    const failed = await this.redis.get(failKey);
    if (failed !== null && Number(failed) >= LOGIN_FAIL_LIMIT) {
      const ttl = await this.redis.ttl(failKey);
      throw problem(429, 'AUTH_LOCKED', '连续失败次数过多，账号已锁定 15 分钟，请稍后再试', {
        retryAfterSeconds: ttl > 0 ? ttl : LOGIN_FAIL_LOCK_SECONDS,
      });
    }

    const user = await this.prisma.user.findFirst({
      where: { username: input.username, deletedAt: null },
    });
    const passwordOk = user ? await verifyPassword(user.passwordHash, input.password) : false;

    if (!user || !passwordOk) {
      const count = await this.redis.incr(failKey);
      if (count === 1) {
        await this.redis.expire(failKey, LOGIN_FAIL_LOCK_SECONDS);
      }
      throw problem(401, 'INVALID_CREDENTIALS', '账号或密码错误');
    }

    await this.redis.del(failKey);

    const rememberMe = input.rememberMe;
    const ttlDays = rememberMe ? REFRESH_REMEMBER_TTL_DAYS : REFRESH_SESSION_TTL_DAYS;
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: sha256(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + ttlDays * DAY_MS),
      },
    });

    return {
      accessToken: this.signAccessToken(user),
      refreshToken,
      rememberMe,
      username: user.username,
      role: user.role,
    };
  }

  // 刷新：校验刷新令牌（未撤销、未过期、账号未删除）→ 签发新访问令牌。
  async refresh(refreshToken: string | undefined): Promise<{ accessToken: string }> {
    if (!refreshToken) {
      throw problem(401, 'TOKEN_MISSING', '缺少刷新令牌');
    }
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (
      !record ||
      record.revokedAt !== null ||
      record.expiresAt <= new Date() ||
      record.user.deletedAt !== null
    ) {
      throw problem(401, 'TOKEN_INVALID', '刷新令牌无效或已过期');
    }
    return { accessToken: this.signAccessToken(record.user) };
  }

  // 登出：撤销当前刷新令牌（记录保留，供审计）。
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // 修改密码：校验旧密码 → 更新哈希 → 撤销该账号全部刷新会话（其他端需重新登录）。
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt !== null) {
      throw problem(401, 'UNAUTHORIZED', '登录态无效');
    }
    const passwordOk = await verifyPassword(user.passwordHash, input.oldPassword);
    if (!passwordOk) {
      throw problem(401, 'INVALID_CREDENTIALS', '旧密码不正确');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // 访问令牌校验（鉴权守卫经此消费，design/账号与权限.md §6）：
  // 校验统一在服务层完成，前端不做安全判断。
  verifyAccessToken(token: string | undefined): AuthUser {
    if (!token) {
      throw problem(401, 'UNAUTHORIZED', '未登录');
    }
    try {
      const payload = jwt.verify(token, this.jwtSecret()) as JwtPayload & {
        username?: string;
        role?: string;
      };
      if (!payload.sub || typeof payload.username !== 'string' || typeof payload.role !== 'string') {
        throw problem(401, 'TOKEN_INVALID', '访问令牌无效');
      }
      return { userId: payload.sub, username: payload.username, role: payload.role };
    } catch {
      throw problem(401, 'TOKEN_INVALID', '访问令牌无效或已过期');
    }
  }

  private signAccessToken(user: { id: string; username: string; role: string }): string {
    return jwt.sign({ username: user.username, role: user.role }, this.jwtSecret(), {
      subject: user.id,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  private jwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('缺少 JWT_SECRET 环境变量（见 apps/server/.env.example）');
    }
    return secret;
  }
}