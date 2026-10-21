import { ApiProperty } from '@nestjs/swagger';

// 修改密码请求（product/账号与权限.md R-账号与权限-001：顶栏头像下拉进入，登录态操作）。
// 注意：属性须显式标注 type（开发运行时 tsx 不产出 design:type 元数据）。
export class ChangePasswordBodyDto {
  @ApiProperty({ type: String, description: '旧密码' })
  oldPassword!: string;

  @ApiProperty({ type: String, description: '新密码，至少 8 位' })
  newPassword!: string;
}