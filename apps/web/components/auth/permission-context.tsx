'use client';

import { createContext, useContext } from 'react';
import { hasScope, type Scope, type UserRole } from '@mcc/shared';

// 角色上下文（design/账号与权限.md §7）：壳在登录态恢复后写入角色，
// 页面用它做菜单与入口裁剪；安全边界仍在服务端守卫。

const RoleContext = createContext<UserRole | null>(null);

export function RoleProvider({
  role,
  children,
}: {
  role: UserRole | null;
  children: React.ReactNode;
}): React.ReactElement {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): UserRole | null {
  return useContext(RoleContext);
}

export function useCan(scope: Scope): boolean {
  return hasScope(useContext(RoleContext), scope);
}
