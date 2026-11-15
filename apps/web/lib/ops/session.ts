import { isPlatformRole, type PlatformRole } from '@mcc/shared';

// 平台运营访问令牌（design/账号与权限.md §7）：
// 与租户会话分开存储，只存内存；刷新走独立的 ops_refresh_token Cookie。
let accessToken: string | null = null;

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

export const opsSession = {
  get(): string | null {
    return accessToken;
  },
  set(token: string): void {
    accessToken = token;
  },
  clear(): void {
    accessToken = null;
  },
};

export function currentOpsUsername(): string | null {
  return readPayload()?.username ?? null;
}

export function currentOpsRole(): PlatformRole | null {
  const role = readPayload()?.role;
  return isPlatformRole(role) ? role : null;
}
