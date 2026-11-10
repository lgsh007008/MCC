import { z } from 'zod';

// 账号与权限领域的边界校验 schema（design/账号与权限.md §3）：
// 前后端共用同一份（技术方案 §8.4），服务层以 ZodValidationPipe 落地。

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
  // 「记住登录」：勾选 → 刷新令牌 30 天；不勾选 → 会话级（design/账号与权限.md §4）
  rememberMe: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;

// 刷新令牌：web 经 httpOnly Cookie 传递；无 Cookie 端（如将来的 miniapp）
// 可经请求体传递（design/账号与权限.md §4）。
export const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(512).optional(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

// 登出令牌经 httpOnly Cookie 传递，请求体为空。
export const logoutSchema = z.object({});
export type LogoutInput = z.infer<typeof logoutSchema>;

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ── 账号管理（R-账号与权限-002）────────────────────────────
export const userRoleSchema = z.enum(['ADMIN', 'SALES', 'FINANCE', 'WORKER']);
export type UserRoleValue = z.infer<typeof userRoleSchema>;

export const userCreateSchema = z.object({
  username: z.string().trim().min(1, '请输入账号').max(64),
  password: z.string().min(8, '密码至少 8 位').max(128),
  role: userRoleSchema,
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userStatusInputSchema = z.object({
  status: z.enum(['active', 'inactive']),
});
export type UserStatusInput = z.infer<typeof userStatusInputSchema>;

export const userRoleInputSchema = z.object({
  role: userRoleSchema,
});
export type UserRoleInput = z.infer<typeof userRoleInputSchema>;

export const userResetPasswordSchema = z.object({
  password: z.string().min(8, '密码至少 8 位').max(128),
});
export type UserResetPasswordInput = z.infer<typeof userResetPasswordSchema>;

export const userListQuerySchema = z.object({
  keyword: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;