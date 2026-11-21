import { ApiProperty } from '@nestjs/swagger';

// OpenAPI 契约的请求形状（ADR-006：契约由装饰器代码生成，不手写接口文档）。
// 运行时校验以 @mcc/shared 的 zod schema 为准（ZodValidationPipe，技术方案 §8.4）。
// 注意：属性须显式标注 type——开发运行时（tsx）不产出 design:type 元数据，缺省会触发循环依赖探测。
export class LoginBodyDto {
  @ApiProperty({ type: String, description: '手机号（唯一登录标识）', example: '13800000001' })
  phone!: string;

  @ApiProperty({ type: String, description: '密码', example: 'Mcc@2026' })
  password!: string;

  @ApiProperty({
    type: Boolean,
    description: '记住登录：勾选 → 刷新令牌 30 天；不勾选 → 会话级',
    default: false,
  })
  rememberMe?: boolean;
}

// 自助注册（R-账号与权限-005）：企业名称 + 首管理员，确认密码仅前端校验不提交。
export class RegisterBodyDto {
  @ApiProperty({ type: String, description: '企业名称', example: '梅好木业' })
  companyName!: string;

  @ApiProperty({ type: String, description: '首管理员姓名', example: '张三' })
  username!: string;

  @ApiProperty({ type: String, description: '手机号（唯一登录标识）', example: '13800000002' })
  phone!: string;

  @ApiProperty({ type: String, description: '密码（至少 8 位）', example: 'Mcc@2026' })
  password!: string;

  @ApiProperty({
    type: Boolean,
    description: '记住登录：注册默认 true，刷新令牌 30 天',
    default: true,
  })
  rememberMe?: boolean;
}

export class LoginResponseDto {
  @ApiProperty({ type: String, description: '短期访问令牌，web 端存内存并以 Bearer 请求头携带' })
  accessToken!: string;

  @ApiProperty({ type: String, description: '姓名/显示名' })
  username!: string;

  @ApiProperty({ type: String, description: '角色：ADMIN / SALES / FINANCE / WORKER' })
  role!: string;

  @ApiProperty({ type: [String], description: '租户有效功能（菜单按 feature ∩ scope 裁剪）' })
  features!: string[];

  @ApiProperty({ type: Boolean, description: '首次登录 / 重置密码后为 true，必须先改密' })
  mustChangePassword!: boolean;
}

export class RefreshRequestDto {
  @ApiProperty({
    type: String,
    required: false,
    description: '无 Cookie 客户端经请求体传递刷新令牌；web 走 Cookie 时无需此字段',
  })
  refreshToken?: string;
}

export class RefreshResponseDto {
  @ApiProperty({ type: String, description: '新签发的访问令牌' })
  accessToken!: string;

  @ApiProperty({ type: [String], description: '租户有效功能（刷新后重新下发，菜单据此裁剪）' })
  features!: string[];

  @ApiProperty({ type: Boolean, description: '待改密标志：为 true 时前端进入强制改密' })
  mustChangePassword!: boolean;
}