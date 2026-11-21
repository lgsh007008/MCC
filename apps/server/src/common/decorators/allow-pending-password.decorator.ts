import { SetMetadata } from '@nestjs/common';

// 待改密放行标记（ADR-015）：仅 change-password 允许在 mustChangePassword 状态下调用；
// 其余登录态接口由 AuthGuard 统一返回 403 PASSWORD_CHANGE_REQUIRED。
export const ALLOW_PENDING_PASSWORD_KEY = 'mcc:allow-pending-password';

export const AllowPendingPassword = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);
