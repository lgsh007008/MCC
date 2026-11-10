import { ApiProperty } from '@nestjs/swagger';

// 账号管理契约（ADR-006：由装饰器生成 OpenAPI，不手写接口文档）。

export class UserDto {
  @ApiProperty({ type: String, description: '账号 id' }) id!: string;
  @ApiProperty({ type: String, description: '账号名' }) username!: string;
  @ApiProperty({ type: String, enum: ['ADMIN', 'SALES', 'FINANCE', 'WORKER'], description: '角色' })
  role!: string;
  @ApiProperty({ type: String, description: '角色显示名' }) roleLabel!: string;
  @ApiProperty({ type: String, enum: ['active', 'inactive'], description: '状态' }) status!: string;
  @ApiProperty({ type: String, description: '创建时间（ISO）' }) createdAt!: string;
}

export class UserListDto {
  @ApiProperty({ type: Number, description: '总数' }) total!: number;
  @ApiProperty({ type: () => [UserDto] }) items!: UserDto[];
}

export class UserCreateBodyDto {
  @ApiProperty({ type: String, description: '账号（租户内唯一）', example: 'sales01' })
  username!: string;

  @ApiProperty({ type: String, description: '初始密码（至少 8 位）', example: 'Mcc@2026' })
  password!: string;

  @ApiProperty({ type: String, enum: ['ADMIN', 'SALES', 'FINANCE', 'WORKER'], description: '角色' })
  role!: string;
}

export class UserStatusBodyDto {
  @ApiProperty({ type: String, enum: ['active', 'inactive'], description: '启用 / 停用' })
  status!: string;
}

export class UserRoleBodyDto {
  @ApiProperty({ type: String, enum: ['ADMIN', 'SALES', 'FINANCE', 'WORKER'], description: '新角色' })
  role!: string;
}

export class UserResetPasswordBodyDto {
  @ApiProperty({ type: String, description: '新密码（至少 8 位）', example: 'Mcc@2026' })
  password!: string;
}
