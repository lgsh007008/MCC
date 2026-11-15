// 令牌与会话机制的口径常量（design/账号与权限.md §4、§5）。
// 时长参数已拍板：访问令牌 15 分钟；记住登录 → 刷新令牌 30 天，不勾选 → 会话级。

export const AUTH_COOKIE_NAME = 'mcc_refresh';
export const AUTH_COOKIE_PATH = '/api/v1/auth';

// 平台运营身份使用独立 Cookie（Path 限 /api/v1/ops），与租户刷新令牌互不解析
export const OPS_AUTH_COOKIE_NAME = 'ops_refresh_token';
export const OPS_AUTH_COOKIE_PATH = '/api/v1/ops';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

// 会话级刷新令牌的兜底过期（cookie 本身为会话级，浏览器关闭即失效）。
export const REFRESH_SESSION_TTL_DAYS = 1;
export const REFRESH_REMEMBER_TTL_DAYS = 30;

// 受众（design/账号与权限.md §4）：租户令牌 aud = web，平台令牌 aud = ops，守卫按受众拒绝跨端调用。
export const TENANT_TOKEN_AUDIENCE = 'web';
export const PLATFORM_TOKEN_AUDIENCE = 'ops';

// 失败锁定：连续 5 次锁 15 分钟（product/账号与权限.md R-账号与权限-001）
export const LOGIN_FAIL_LIMIT = 5;
export const LOGIN_FAIL_LOCK_SECONDS = 15 * 60;
export const loginFailKey = (tenantCode: string, username: string): string =>
  `login:fail:${tenantCode}:${username}`;
export const platformLoginFailKey = (username: string): string => `login:fail:ops:${username}`;
