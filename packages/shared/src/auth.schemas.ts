import { z } from 'zod';

// 账号与权限领域的边界校验 schema（design/账号与权限.md §3）：
// 前后端共用同一份（技术方案 §8.4），服务层以 ZodValidationPipe 落地。

export const loginSchema = z.object({
  // 租户编号：先确定租户，再在该租户内校验账号（design/账号与权限.md §6）
  tenantCode: z
    .string()
    .trim()
    .regex(/^TN-\d{5,}$/, '请输入租户编号（如 TN-00001）'),
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
  // 「记住登录」：勾选 → 刷新令牌 30 天；不勾选 → 会话级（design/账号与权限.md §4）
  rememberMe: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;

// 平台运营登录（/ops/login）：与租户登录互不通用（R-账号与权限-004）
export const platformLoginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().default(false),
});
export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;

export const platformUserCreateSchema = z.object({
  username: z.string().trim().min(1, '请输入账号').max(64),
  password: z.string().min(8, '密码至少 8 位').max(128),
  role: z.enum(['PLATFORM_ADMIN']).default('PLATFORM_ADMIN'),
});
export type PlatformUserCreateInput = z.infer<typeof platformUserCreateSchema>;

export const platformUserStatusInputSchema = z.object({
  status: z.enum(['active', 'inactive']),
});
export type PlatformUserStatusInput = z.infer<typeof platformUserStatusInputSchema>;

export const platformUserResetPasswordSchema = z.object({
  password: z.string().min(8, '密码至少 8 位').max(128),
});
export type PlatformUserResetPasswordInput = z.infer<typeof platformUserResetPasswordSchema>;

export const platformUserListQuerySchema = z.object({
  keyword: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PlatformUserListQuery = z.infer<typeof platformUserListQuerySchema>;

// 平台运营在租户详情内补建 / 新增租户管理员（R-账号与权限-004）
export const tenantAdminCreateSchema = z.object({
  username: z.string().trim().min(1, '请输入账号').max(64),
  password: z.string().min(8, '密码至少 8 位').max(128),
});
export type TenantAdminCreateInput = z.infer<typeof tenantAdminCreateSchema>;

export const tenantAdminResetPasswordSchema = z.object({
  password: z.string().min(8, '密码至少 8 位').max(128),
});
export type TenantAdminResetPasswordInput = z.infer<typeof tenantAdminResetPasswordSchema>;

export const tenantAccountCountsQuerySchema = z.object({
  tenantIds: z.string().trim().min(1),
});
export type TenantAccountCountsQuery = z.infer<typeof tenantAccountCountsQuerySchema>;

// 刷新令牌：web 经 httpOnly Cookie 传递；无 Cookie 客户端
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