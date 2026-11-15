import { Body, Controller, HttpCode, HttpException, Post, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  changePasswordSchema,
  platformLoginSchema,
  refreshSchema,
  type ChangePasswordInput,
  type PlatformLoginInput,
  type RefreshInput,
} from '@mcc/shared';
import { auditRequestMeta } from '../../common/audit.util.js';
import { SkipAudit } from '../../common/decorators/audit-action.decorator.js';
import {
  PlatformAuditAction,
  SkipPlatformAudit,
} from '../../common/decorators/platform-audit-action.decorator.js';
import {
  CurrentPlatformUser,
  type PlatformAuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RateLimit } from '../../common/decorators/rate-limit.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PlatformAuditService } from '../audit/index.js';
import {
  OPS_AUTH_COOKIE_NAME,
  OPS_AUTH_COOKIE_PATH,
  REFRESH_REMEMBER_TTL_DAYS,
} from './auth.constants.js';
import { ChangePasswordBodyDto } from './dto/change-password.dto.js';
import {
  PlatformLoginBodyDto,
  PlatformLoginResponseDto,
  PlatformRefreshRequestDto,
  PlatformRefreshResponseDto,
} from './dto/platform-auth.dto.js';
import { PlatformAuthService } from './platform-auth.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const readRefreshCookie = (req: Request): string | undefined =>
  (req.cookies as Record<string, string> | undefined)?.[OPS_AUTH_COOKIE_NAME];

// 平台运营登录接口（design/账号与权限.md §3）：独立入口 /ops/auth，独立 Cookie 与受众。
// 登录 / 登出 / 刷新由本控制器显式写平台审计并 @SkipPlatformAudit，避免拦截器重复落库。
@ApiTags('ops-auth')
@Controller('ops/auth')
export class PlatformAuthController {
  constructor(
    private readonly platformAuthService: PlatformAuthService,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  @Public()
  @RateLimit(30, 60_000)
  @SkipPlatformAudit()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '平台运营登录：签发平台访问令牌 + 平台刷新令牌', security: [] })
  @ApiBody({ type: PlatformLoginBodyDto })
  @ApiOkResponse({ type: PlatformLoginResponseDto })
  async login(
    @Body(new ZodValidationPipe(platformLoginSchema)) body: PlatformLoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PlatformLoginResponseDto> {
    try {
      const result = await this.platformAuthService.login(body);
      const requestMeta = auditRequestMeta(req);
      void this.platformAudit.write({
        actorId: result.userId,
        actorUsername: result.username,
        domain: 'platform',
        action: 'login',
        actionLabel: '平台运营登录',
        objectType: 'platform_user',
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
      res.cookie(OPS_AUTH_COOKIE_NAME, result.refreshToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: OPS_AUTH_COOKIE_PATH,
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
      void this.platformAudit.write({
        actorUsername: body.username,
        domain: 'platform',
        action: 'login',
        actionLabel: '平台运营登录',
        objectType: 'platform_user',
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
  @RateLimit(120, 60_000)
  @SkipPlatformAudit()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: '凭 ops_refresh_token Cookie（或请求体）换新平台访问令牌', security: [] })
  @ApiBody({ type: PlatformRefreshRequestDto })
  @ApiOkResponse({ type: PlatformRefreshResponseDto })
  async refresh(
    @Req() req: Request,
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
  ): Promise<PlatformRefreshResponseDto> {
    return this.platformAuthService.refresh(readRefreshCookie(req) ?? body.refreshToken);
  }

  @Public()
  @SkipPlatformAudit()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: '撤销平台刷新令牌，登出', security: [] })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const actor = await this.platformAuthService.logout(readRefreshCookie(req));
    const requestMeta = auditRequestMeta(req);
    void this.platformAudit.write({
      actorId: actor?.userId ?? null,
      actorUsername: actor?.username ?? null,
      domain: 'platform',
      action: 'logout',
      actionLabel: '平台运营登出',
      objectType: 'platform_user',
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
    res.clearCookie(OPS_AUTH_COOKIE_NAME, { path: OPS_AUTH_COOKIE_PATH });
  }

  @RateLimit(30, 60_000)
  @SkipAudit()
  @PlatformAuditAction({
    domain: 'platform',
    action: 'change-password',
    label: '修改平台账号密码',
    objectType: 'platform_user',
  })
  @Post('change-password')
  @HttpCode(204)
  @ApiOperation({ summary: '平台账号改密；成功后撤销该账号全部平台刷新会话' })
  @ApiBody({ type: ChangePasswordBodyDto })
  async changePassword(
    @CurrentPlatformUser() user: PlatformAuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.platformAuthService.changePassword(user.userId, body);
    res.clearCookie(OPS_AUTH_COOKIE_NAME, { path: OPS_AUTH_COOKIE_PATH });
  }
}
