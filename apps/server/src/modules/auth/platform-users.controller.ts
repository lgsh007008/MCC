import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  platformUserCreateSchema,
  platformUserListQuerySchema,
  platformUserResetPasswordSchema,
  platformUserStatusInputSchema,
  tenantAccountCountsQuerySchema,
  tenantAdminCreateSchema,
  tenantAdminResetPasswordSchema,
  type PlatformUserCreateInput,
  type PlatformUserListQuery,
  type PlatformUserResetPasswordInput,
  type PlatformUserStatusInput,
  type TenantAccountCountsQuery,
  type TenantAdminCreateInput,
  type TenantAdminResetPasswordInput,
} from '@mcc/shared';
import {
  CurrentPlatformUser,
  type PlatformAuthUser,
} from '../../common/decorators/current-user.decorator.js';
import { PlatformAuditAction } from '../../common/decorators/platform-audit-action.decorator.js';
import { RequirePlatformScopes } from '../../common/decorators/require-platform-scopes.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  PlatformUserCreateBodyDto,
  PlatformUserDto,
  PlatformUserListDto,
  PlatformUserResetPasswordBodyDto,
  PlatformUserStatusBodyDto,
  TenantAccountCountsDto,
  TenantAdminCreateBodyDto,
  TenantAdminDto,
  TenantAdminListDto,
  TenantAdminResetPasswordBodyDto,
} from './dto/platform-user.dto.js';
import { PlatformUsersService } from './platform-users.service.js';

// 平台账号与租户管理员接口（design/账号与权限.md §3）：
// 平台账号归 platform:account:manage；租户管理员查看归 platform:tenant:view、写操作归 platform:tenant:manage。
// 租户 id 首个为历史值 default，不能使用 ParseUUIDPipe。
@ApiTags('ops-accounts')
@Controller('ops')
export class PlatformUsersController {
  constructor(private readonly platformUsersService: PlatformUsersService) {}

  @Get('accounts')
  @RequirePlatformScopes('platform:account:manage')
  @ApiOperation({ summary: '平台运营账号列表（不含密码）' })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: '账号名模糊' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiOkResponse({ type: PlatformUserListDto })
  listPlatformUsers(
    @Query(new ZodValidationPipe(platformUserListQuerySchema)) query: PlatformUserListQuery,
  ): Promise<PlatformUserListDto> {
    return this.platformUsersService.listPlatformUsers(query);
  }

  @Post('accounts')
  @RequirePlatformScopes('platform:account:manage')
  @PlatformAuditAction({
    domain: 'platform',
    action: 'create-account',
    label: '新建平台账号',
    objectType: 'platform_user',
  })
  @ApiOperation({ summary: '新建平台运营账号（全局唯一；初始密码至少 8 位）' })
  @ApiBody({ type: PlatformUserCreateBodyDto })
  @ApiCreatedResponse({ type: PlatformUserDto })
  createPlatformUser(
    @Body(new ZodValidationPipe(platformUserCreateSchema)) body: PlatformUserCreateInput,
  ): Promise<PlatformUserDto> {
    return this.platformUsersService.createPlatformUser(body);
  }

  @Patch('accounts/:id/status')
  @RequirePlatformScopes('platform:account:manage')
  @PlatformAuditAction({
    domain: 'platform',
    action: 'change-account-status',
    label: '启停用平台账号',
    objectType: 'platform_user',
  })
  @ApiOperation({ summary: '启用 / 停用平台账号（不能停用自己或最后一个启用平台管理员）' })
  @ApiBody({ type: PlatformUserStatusBodyDto })
  @ApiOkResponse({ type: PlatformUserDto })
  setPlatformUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(platformUserStatusInputSchema)) body: PlatformUserStatusInput,
    @CurrentPlatformUser() user: PlatformAuthUser,
  ): Promise<PlatformUserDto> {
    return this.platformUsersService.setPlatformUserStatus(id, body, user.userId);
  }

  @Post('accounts/:id/reset-password')
  @RequirePlatformScopes('platform:account:manage')
  @PlatformAuditAction({
    domain: 'platform',
    action: 'reset-account-password',
    label: '重置平台账号密码',
    objectType: 'platform_user',
  })
  @HttpCode(204)
  @ApiOperation({ summary: '重置平台账号密码并撤销其全部平台刷新会话' })
  @ApiBody({ type: PlatformUserResetPasswordBodyDto })
  async resetPlatformUserPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(platformUserResetPasswordSchema))
    body: PlatformUserResetPasswordInput,
  ): Promise<void> {
    await this.platformUsersService.resetPlatformUserPassword(id, body);
  }

  @Get('tenant-account-counts')
  @RequirePlatformScopes('platform:tenant:view')
  @ApiOperation({ summary: '批量租户账号数（未删除、含停用；平台账号不计入）' })
  @ApiQuery({ name: 'tenantIds', required: true, type: String, description: '租户 id，逗号分隔（最多 200）' })
  @ApiOkResponse({ type: TenantAccountCountsDto })
  tenantAccountCounts(
    @Query(new ZodValidationPipe(tenantAccountCountsQuerySchema)) query: TenantAccountCountsQuery,
  ): Promise<TenantAccountCountsDto> {
    return this.platformUsersService.tenantAccountCounts(query);
  }

  @Get('tenants/:tenantId/admins')
  @RequirePlatformScopes('platform:tenant:view')
  @ApiOperation({ summary: '租户 ADMIN 账号列表（跨租户受控作用域）' })
  @ApiOkResponse({ type: TenantAdminListDto })
  tenantAdmins(@Param('tenantId') tenantId: string): Promise<TenantAdminListDto> {
    return this.platformUsersService.tenantAdmins(tenantId);
  }

  @Post('tenants/:tenantId/admins')
  @RequirePlatformScopes('platform:tenant:manage')
  @PlatformAuditAction({
    domain: 'tenant',
    action: 'create-tenant-admin',
    label: '补建租户管理员',
    objectType: 'user',
  })
  @ApiOperation({ summary: '补建 / 新增租户管理员（校验套餐额度）' })
  @ApiBody({ type: TenantAdminCreateBodyDto })
  @ApiCreatedResponse({ type: TenantAdminDto })
  createTenantAdmin(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(tenantAdminCreateSchema)) body: TenantAdminCreateInput,
  ): Promise<TenantAdminDto> {
    return this.platformUsersService.createTenantAdmin(tenantId, body);
  }

  @Post('tenants/:tenantId/admins/:userId/reset-password')
  @RequirePlatformScopes('platform:tenant:manage')
  @PlatformAuditAction({
    domain: 'tenant',
    action: 'reset-tenant-admin-password',
    label: '重置租户管理员密码',
    objectType: 'user',
  })
  @HttpCode(204)
  @ApiOperation({ summary: '重置租户管理员密码并撤销该账号刷新会话' })
  @ApiBody({ type: TenantAdminResetPasswordBodyDto })
  async resetTenantAdminPassword(
    @Param('tenantId') tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(tenantAdminResetPasswordSchema))
    body: TenantAdminResetPasswordInput,
  ): Promise<void> {
    await this.platformUsersService.resetTenantAdminPassword(tenantId, userId, body);
  }
}
