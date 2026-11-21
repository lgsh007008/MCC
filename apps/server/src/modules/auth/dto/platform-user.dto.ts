import { ApiProperty } from '@nestjs/swagger';

// 平台账号与租户管理员账号契约（ADR-006）。

export class PlatformUserDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) username!: string;
  @ApiProperty({ type: String }) role!: string;
  @ApiProperty({ type: String }) roleLabel!: string;
  @ApiProperty({ type: String, enum: ['active', 'inactive'] }) status!: string;
  @ApiProperty({ type: String }) createdAt!: string;
}

export class PlatformUserListDto {
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: () => [PlatformUserDto] }) items!: PlatformUserDto[];
}

export class PlatformUserCreateBodyDto {
  @ApiProperty({ type: String, description: '平台账号（全局唯一）' })
  username!: string;

  @ApiProperty({ type: String, description: '初始密码（至少 8 位）' })
  password!: string;

  @ApiProperty({ type: String, enum: ['PLATFORM_ADMIN'], description: '平台角色' })
  role?: string;
}

export class PlatformUserStatusBodyDto {
  @ApiProperty({ type: String, enum: ['active', 'inactive'], description: '启用 / 停用' })
  status!: string;
}

export class PlatformUserResetPasswordBodyDto {
  @ApiProperty({ type: String, description: '新密码（至少 8 位）' })
  password!: string;
}

export class TenantAccountCountDto {
  @ApiProperty({ type: String }) tenantId!: string;
  @ApiProperty({ type: Number, description: '未删除账号数（含停用；平台账号不计入）' })
  accountCount!: number;
}

export class TenantAccountCountsDto {
  @ApiProperty({ type: () => [TenantAccountCountDto] }) items!: TenantAccountCountDto[];
}

export class TenantAdminDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String, description: '姓名/显示名' }) username!: string;
  @ApiProperty({ type: String, nullable: true, description: '手机号（登录标识；停用账号可为空）' })
  phone!: string | null;
  @ApiProperty({ type: String, enum: ['active', 'inactive'] }) status!: string;
  @ApiProperty({ type: String }) createdAt!: string;
}

export class TenantAdminListDto {
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: () => [TenantAdminDto] }) items!: TenantAdminDto[];
}

export class TenantAdminCreateBodyDto {
  @ApiProperty({ type: String, description: '姓名/显示名（租户内唯一）' })
  username!: string;

  @ApiProperty({ type: String, description: '手机号（全局唯一，登录标识）' })
  phone!: string;

  @ApiProperty({ type: String, description: '初始密码（至少 8 位）' })
  password!: string;
}

export class TenantAdminPhoneBodyDto {
  @ApiProperty({ type: String, description: '新手机号（全局唯一，登录标识）' })
  phone!: string;
}

export class TenantAdminResetPasswordBodyDto {
  @ApiProperty({ type: String, description: '新密码（至少 8 位）' })
  password!: string;
}
