import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { ChangePasswordInput, LoginInput, RefreshInput } from '@mcc/shared';
import { AuditAction, SkipAudit } from '../../common/decorators/audit-action.decorator.js';
import { auditRequestMeta } from '../../common/audit.util.js';
import { RateLimit } from '../../common/decorators/rate-limit.decorator.js';
import { AuditService } from '../audit/index.js';
import {
  changePasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
} from '@mcc/shared';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_PATH,
  REFRESH_REMEMBER_TTL_DAYS,
} from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { ChangePasswordBodyDto } from './dto/change-password.dto.js';
import { LoginBodyDto, LoginResponseDto, RefreshRequestDto, RefreshResponseDto } from './dto/login.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const readRefreshCookie = (req: Request): string | undefined =>
  (req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE_NAME];

// 接口清单与路径（design/账号与权限.md §3）；契约由装饰器代码生成（ADR-006）。
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @RateLimit(30, 60_000)
  @SkipAudit()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '登录：校验账号密码，签发访问令牌 + 刷新令牌', security: [] })
  @ApiBody({ type: LoginBodyDto })
  @ApiOkResponse({ type: LoginResponseDto })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    try {
      const result = await this.authService.login(body);
      const requestMeta = auditRequestMeta(req);
      void this.audit.write({
        actorId: result.userId,
        actorUsername: result.username,
        actorRole: result.role,
        domain: 'auth',
        action: 'login',
        actionLabel: '登录',
        objectType: 'user',
        objectId: result.userId,
        objectCode: result.username,
        result: 'ok',
        statusCode: 200,
        method: req.method,
        path: req.path,
        ip: requestMeta.ip,
        userAgent: requestMeta.userAgent,
        requestId: requestMeta.requestId,
        payload: { method: req.method, path: req.path },
      });
      res.cookie(AUTH_COOKIE_NAME, result.refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        // 本地开发为 http；生产全站 HTTPS（技术方案 §8.1）后改由环境控制
        secure: false,
        path: AUTH_COOKIE_PATH,
        // 不勾选「记住登录」→ 会话级 cookie（无 maxAge，浏览器关闭即失效）
        maxAge: result.rememberMe ? REFRESH_REMEMBER_TTL_DAYS * DAY_MS : undefined,
      });
      return { accessToken: result.accessToken, username: result.username, role: result.role };
    } catch (error) {
      const requestMeta = auditRequestMeta(req);
      const statusCode = error instanceof HttpException ? error.getStatus() : 500;
      const response = error instanceof HttpException ? error.getResponse() : null;
      const errorCode =
        typeof response === 'object' &&
        response !== null &&
        'code' in response &&
        typeof (response as { code?: unknown }).code === 'string'
          ? (response as { code: string }).code
          : null;
      void this.audit.write({
        actorUsername: body.username,
        domain: 'auth',
        action: 'login',
        actionLabel: '登录',
        objectType: 'user',
        result: 'failed',
        statusCode,
        errorCode,
        method: req.method,
        path: req.path,
        ip: requestMeta.ip,
        userAgent: requestMeta.userAgent,
        requestId: requestMeta.requestId,
        payload: { method: req.method, path: req.path },
      });
      throw error;
    }
  }

  @Public()
  // 刷新按「每次整页加载一次」计；限流键是 IP，同一出口 IP（办公室 NAT / E2E）共享额度，
  // 30 次 / 60 秒会把正常使用打成 429 导致被迫回登录页，故按默认额度放宽
  @RateLimit(120, 60_000)
  @SkipAudit()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: '凭 httpOnly Cookie（或请求体）中的刷新令牌换新访问令牌', security: [] })
  @ApiBody({ type: RefreshRequestDto })
  @ApiOkResponse({ type: RefreshResponseDto })
  async refresh(
    @Req() req: Request,
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
  ): Promise<RefreshResponseDto> {
    // web 走 Cookie；无 Cookie 端经请求体传递（design/账号与权限.md §4）
    return this.authService.refresh(readRefreshCookie(req) ?? body.refreshToken);
  }

  @Public()
  @SkipAudit()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: '撤销刷新令牌，登出', security: [] })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(logoutSchema)) _body: unknown,
  ): Promise<void> {
    const actor = await this.authService.logout(readRefreshCookie(req));
    const requestMeta = auditRequestMeta(req);
    void this.audit.write({
      actorId: actor?.userId ?? null,
      actorUsername: actor?.username ?? null,
      actorRole: actor?.role ?? null,
      domain: 'auth',
      action: 'logout',
      actionLabel: '登出',
      objectType: 'user',
      objectId: actor?.userId ?? null,
      objectCode: actor?.username ?? null,
      result: 'ok',
      statusCode: 204,
      method: req.method,
      path: req.path,
      ip: requestMeta.ip,
      userAgent: requestMeta.userAgent,
      requestId: requestMeta.requestId,
      payload: { method: req.method, path: req.path },
    });
    res.clearCookie(AUTH_COOKIE_NAME, { path: AUTH_COOKIE_PATH });
  }

  @RateLimit(30, 60_000)
  @AuditAction({ domain: 'auth', action: 'change-password', label: '修改密码', objectType: 'user' })
  @Post('change-password')
  @HttpCode(204)
  @ApiOperation({ summary: '登录态下修改密码；成功后撤销该账号全部刷新会话' })
  @ApiBody({ type: ChangePasswordBodyDto })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.changePassword(user.userId, body);
    res.clearCookie(AUTH_COOKIE_NAME, { path: AUTH_COOKIE_PATH });
  }
}