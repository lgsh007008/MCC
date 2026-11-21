import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { ChangePasswordInput, LoginInput, RefreshInput, RegisterInput } from '@mcc/shared';
import { AuditAction, SkipAudit } from '../../common/decorators/audit-action.decorator.js';
import { auditRequestMeta } from '../../common/audit.util.js';
import { RateLimit } from '../../common/decorators/rate-limit.decorator.js';
import { AuditService } from '../audit/index.js';
import {
  changePasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from '@mcc/shared';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { AllowPendingPassword } from '../../common/decorators/allow-pending-password.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { runWithTenant } from '../tenant/index.js';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_PATH,
  REFRESH_REMEMBER_TTL_DAYS,
} from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { ChangePasswordBodyDto } from './dto/change-password.dto.js';
import {
  LoginBodyDto,
  LoginResponseDto,
  RefreshRequestDto,
  RefreshResponseDto,
  RegisterBodyDto,
} from './dto/login.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const readRefreshCookie = (req: Request): string | undefined =>
  (req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE_NAME];

// 接口清单与路径（design/账号与权限.md §3）；契约由装饰器代码生成（ADR-006）。
// 登录 / 登出 / 刷新由本控制器显式写审计并 @SkipAudit；审计写库需要租户上下文，故按租户 runWithTenant。
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
  @ApiOperation({ summary: '登录：手机号 + 密码，签发访问令牌 + 刷新令牌', security: [] })
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
      void runWithTenant(result.tenantId, () =>
        this.audit.write({
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
        }),
      );
      this.setRefreshCookie(res, result.refreshToken, result.rememberMe);
      return {
        accessToken: result.accessToken,
        username: result.username,
        role: result.role,
        features: result.features,
        mustChangePassword: result.mustChangePassword,
      };
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
      // 手机号命中时可按其租户归属审计；未命中无法归属租户，不落库。
      const context = await this.authService
        .findLoginAuditContext(body.phone)
        .catch(() => null);
      if (context) {
        void runWithTenant(context.tenantId, () =>
          this.audit.write({
            actorUsername: context.username,
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
          }),
        );
      }
      throw error;
    }
  }

  // 自助注册（R-账号与权限-005）：公开接口；不设注册专用 IP 限流，沿用平台默认限流（120 次 / 分钟 / IP）。
  // 成功后自动登录（种刷新 Cookie）并写租户审计；失败无归属主体，不写审计。
  @Public()
  @SkipAudit()
  @Post('register')
  @HttpCode(201)
  @ApiOperation({
    summary: '自助注册：创建标准版租户 + 首管理员并自动登录',
    security: [],
  })
  @ApiBody({ type: RegisterBodyDto })
  @ApiCreatedResponse({ type: LoginResponseDto })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const result = await this.authService.register(body);
    this.setRefreshCookie(res, result.refreshToken, result.rememberMe);
    const requestMeta = auditRequestMeta(req);
    void runWithTenant(result.tenantId, () =>
      this.audit.write({
        actorId: result.userId,
        actorUsername: result.username,
        actorRole: result.role,
        domain: 'auth',
        action: 'register',
        actionLabel: '自助注册',
        objectType: 'user',
        objectId: result.userId,
        objectCode: result.username,
        result: 'ok',
        statusCode: 201,
        method: req.method,
        path: req.path,
        ip: requestMeta.ip,
        userAgent: requestMeta.userAgent,
        requestId: requestMeta.requestId,
        payload: { method: req.method, path: req.path },
      }),
    );
    return {
      accessToken: result.accessToken,
      username: result.username,
      role: result.role,
      features: result.features,
      mustChangePassword: result.mustChangePassword,
    };
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
    if (actor) {
      const requestMeta = auditRequestMeta(req);
      void runWithTenant(actor.tenantId, () =>
        this.audit.write({
          actorId: actor.userId,
          actorUsername: actor.username,
          actorRole: actor.role,
          domain: 'auth',
          action: 'logout',
          actionLabel: '登出',
          objectType: 'user',
          objectId: actor.userId,
          objectCode: actor.username,
          result: 'ok',
          statusCode: 204,
          method: req.method,
          path: req.path,
          ip: requestMeta.ip,
          userAgent: requestMeta.userAgent,
          requestId: requestMeta.requestId,
          payload: { method: req.method, path: req.path },
        }),
      );
    }
    res.clearCookie(AUTH_COOKIE_NAME, { path: AUTH_COOKIE_PATH });
  }

  @RateLimit(30, 60_000)
  @AuditAction({ domain: 'auth', action: 'change-password', label: '修改密码', objectType: 'user' })
  @AllowPendingPassword()
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

  // 登录与注册共用刷新令牌 Cookie 口径（design/账号与权限.md §4）：
  // 记住登录 → 30 天；否则会话级（无 maxAge），浏览器关闭即失效。
  private setRefreshCookie(res: Response, refreshToken: string, rememberMe: boolean): void {
    res.cookie(AUTH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      // 本地开发为 http；生产全站 HTTPS（技术方案 §8.1）后改由环境控制
      secure: false,
      path: AUTH_COOKIE_PATH,
      maxAge: rememberMe ? REFRESH_REMEMBER_TTL_DAYS * DAY_MS : undefined,
    });
  }
}
