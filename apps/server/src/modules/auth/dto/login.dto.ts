import { ApiProperty } from '@nestjs/swagger';

// OpenAPI 契约的请求形状（ADR-006：契约由装饰器代码生成，不手写接口文档）。
// 运行时校验以 @mcc/shared 的 zod schema 为准（ZodValidationPipe，技术方案 §8.4）。
// 注意：属性须显式标注 type——开发运行时（tsx）不产出 design:type 元数据，缺省会触发循环依赖探测。
export class LoginBodyDto {
  @ApiProperty({ type: String, description: '账号，一人一号', example: 'admin' })
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

export class LoginResponseDto {
  @ApiProperty({ type: String, description: '短期访问令牌，web 端存内存并以 Bearer 请求头携带' })
  accessToken!: string;

  @ApiProperty({ type: String, description: '账号名' })
  username!: string;

  @ApiProperty({ type: String, description: '角色：ADMIN / SALES / FINANCE / WORKER' })
  role!: string;
}

export class RefreshRequestDto {
  @ApiProperty({
    type: String,
    required: false,
    description: '无 Cookie 端（如 miniapp）经请求体传递刷新令牌；web 走 Cookie 时无需此字段',
  })
  refreshToken?: string;
}

export class RefreshResponseDto {
  @ApiProperty({ type: String, description: '新签发的访问令牌' })
  accessToken!: string;
}