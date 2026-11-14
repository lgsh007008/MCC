import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  userCreateSchema,
  userListQuerySchema,
  userResetPasswordSchema,
  userRoleInputSchema,
  userStatusInputSchema,
  type UserCreateInput,
  type UserListQuery,
  type UserResetPasswordInput,
  type UserRoleInput,
  type UserStatusInput,
} from '@mcc/shared';
import { AuditAction } from '../../common/decorators/audit-action.decorator.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { RequireScopes } from '../../common/decorators/require-scopes.decorator.js';
import { withIdempotency } from '../../common/idempotency.js';
import { RedisService } from '../../common/redis.service.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  UserCreateBodyDto,
  UserDto,
  UserListDto,
  UserResetPasswordBodyDto,
  UserRoleBodyDto,
  UserStatusBodyDto,
} from './dto/user.dto.js';
import { UsersService } from './users.service.js';

// 账号管理接口清单（design/账号与权限.md §3）：全部要求 account:manage（技术方案 §8.2）。
@ApiTags('users')
@Controller('users')
@RequireScopes('account:manage')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: '账号列表（不含密码）' })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: '账号名模糊' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiOkResponse({ type: UserListDto })
  list(@Query(new ZodValidationPipe(userListQuerySchema)) query: UserListQuery): Promise<UserListDto> {
    return this.usersService.list(query);
  }

  @Post()
  @AuditAction({ domain: 'auth', action: 'create-user', label: '新建账号', objectType: 'user' })
  @HttpCode(201)
  @ApiOperation({ summary: '新建账号（租户内账号唯一；初始密码至少 8 位）' })
  @ApiBody({ type: UserCreateBodyDto })
  @ApiCreatedResponse({ type: UserDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(userCreateSchema)) body: UserCreateInput,
  ): Promise<UserDto> {
    // 幂等（技术方案 §6.3）：重复提交返回首请求结果，处理中返回 409
    return withIdempotency(this.redis, user.userId, 'users', idempotencyKey, () =>
      this.usersService.create(body),
    );
  }

  @Patch(':id/status')
  @AuditAction({ domain: 'auth', action: 'change-user-status', label: '启停用账号', objectType: 'user' })
  @ApiOperation({ summary: '启用 / 停用账号（不能停用自己或最后一个启用管理员）' })
  @ApiBody({ type: UserStatusBodyDto })
  @ApiOkResponse({ type: UserDto })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(userStatusInputSchema)) body: UserStatusInput,
    @CurrentUser() user: AuthUser,
  ): Promise<UserDto> {
    return this.usersService.setStatus(id, body, user.userId);
  }

  @Patch(':id/role')
  @AuditAction({ domain: 'auth', action: 'change-user-role', label: '修改账号角色', objectType: 'user' })
  @ApiOperation({ summary: '修改角色（不能降级最后一个启用管理员）' })
  @ApiBody({ type: UserRoleBodyDto })
  @ApiOkResponse({ type: UserDto })
  setRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(userRoleInputSchema)) body: UserRoleInput,
  ): Promise<UserDto> {
    return this.usersService.setRole(id, body);
  }

  @Post(':id/reset-password')
  @AuditAction({ domain: 'auth', action: 'reset-user-password', label: '重置账号密码', objectType: 'user' })
  @HttpCode(204)
  @ApiOperation({ summary: '重置账号密码并撤销该账号全部刷新会话' })
  @ApiBody({ type: UserResetPasswordBodyDto })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(userResetPasswordSchema)) body: UserResetPasswordInput,
  ): Promise<void> {
    await this.usersService.resetPassword(id, body);
  }
}
