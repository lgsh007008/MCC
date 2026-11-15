import { ApiProperty } from '@nestjs/swagger';

// 平台运营登录契约（ADR-006）：独立入口 /ops/login，与租户登录互不通用。

export class PlatformLoginBodyDto {
  @ApiProperty({ type: String, description: '平台账号', example: 'opsadmin' })
  username!: string;

  @ApiProperty({ type: String, description: '密码', example: 'Mcc@2026' })
  password!: string;

  @ApiProperty({
    type: Boolean,
    description: '记住登录：勾选 → 刷新令牌 30 天；不勾选 → 会话级',
    default: false,
  })
  rememberMe?: boolean;
}

export class PlatformLoginResponseDto {
  @ApiProperty({ type: String, description: '平台访问令牌，存内存并以 Bearer 请求头携带' })
  accessToken!: string;

  @ApiProperty({ type: String, description: '平台账号名' })
  username!: string;

  @ApiProperty({ type: String, description: '平台角色（当前仅 PLATFORM_ADMIN）' })
  role!: string;
}

export class PlatformRefreshRequestDto {
  @ApiProperty({
    type: String,
    required: false,
    description: '无 Cookie 客户端经请求体传递刷新令牌；web 走 Cookie 时无需此字段',
  })
  refreshToken?: string;
}

export class PlatformRefreshResponseDto {
  @ApiProperty({ type: String, description: '新签发的平台访问令牌' })
  accessToken!: string;
}
