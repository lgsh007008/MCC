import { isFeatureCode, isUserRole, type FeatureCode, type UserRole } from '@mcc/shared';

// 访问令牌的网页端存储（design/账号与权限.md §4、§7）：
// 只存内存、不落 localStorage 等任何持久存储——页面刷新即丢，
// 登录态由 httpOnly Cookie 里的刷新令牌经 refresh 接口静默恢复。
// 有效功能随登录 / 刷新响应下发，用于菜单 feature ∩ scope 裁剪；不在 JWT 中冗余。
let accessToken: string | null = null;
let features: FeatureCode[] | null = null;
let mustChangePassword = false;

const readPayload = (): { username?: string; role?: string } | null => {
  if (!accessToken) {
    return null;
  }
  try {
    return JSON.parse(atob(accessToken.split('.')[1] ?? '')) as {
      username?: string;
      role?: string;
    };
  } catch {
    return null;
  }
};

const toFeatures = (values: readonly string[]): FeatureCode[] =>
  values.filter(isFeatureCode);

export const authSession = {
  get(): string | null {
    return accessToken;
  },
  set(token: string, nextFeatures?: readonly string[], pendingPasswordChange = false): void {
    accessToken = token;
    mustChangePassword = pendingPasswordChange;
    if (nextFeatures) {
      features = toFeatures(nextFeatures);
    }
  },
  features(): FeatureCode[] | null {
    return features;
  },
  mustChangePassword(): boolean {
    return mustChangePassword;
  },
  clear(): void {
    accessToken = null;
    features = null;
    mustChangePassword = false;
  },
};

// 从访问令牌载荷读取当前登录用户名（JWT 载荷含 username）；
// 令牌仅存内存，页面刷新后经 refresh 静默恢复。
export function currentUsername(): string | null {
  return readPayload()?.username ?? null;
}

// 当前角色（product/账号与权限.md R-账号与权限-003）：
// 前端只用于菜单与入口裁剪，权限判定仍以服务端守卫为准。
export function currentRole(): UserRole | null {
  const role = readPayload()?.role;
  return isUserRole(role) ? role : null;
}

// 当前租户有效功能（design/账号与权限.md §7：菜单按 feature ∩ scope 裁剪）。
// null 表示尚未从登录 / 刷新响应取得；调用方此时不做功能裁剪。
export function currentFeatures(): FeatureCode[] | null {
  return features;
}
