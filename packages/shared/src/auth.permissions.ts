// 角色与权限矩阵（product/账号与权限.md R-账号与权限-003）：
// 固定四角色 + 页面级 view/manage scope；服务端守卫与前端菜单共用同一份。
// 未来切换为可配置角色时，只替换 ROLE_SCOPES 的来源（角色表），守卫与页面不变。

export const USER_ROLES = ['ADMIN', 'SALES', 'FINANCE', 'WORKER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SCOPES = [
  'order:view',
  'order:manage',
  'customer:view',
  'customer:manage',
  'finance:view',
  'finance:manage',
  'account:manage',
] as const;
export type Scope = (typeof SCOPES)[number];

export const ROLE_SCOPES: Record<UserRole, readonly Scope[]> = {
  ADMIN: SCOPES,
  SALES: [
    'order:view',
    'order:manage',
    'customer:view',
    'customer:manage',
    'finance:view',
    'finance:manage',
  ],
  FINANCE: ['order:view', 'customer:view', 'finance:view', 'finance:manage'],
  WORKER: ['order:view'],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: '管理员',
  SALES: '销售',
  FINANCE: '财务',
  WORKER: '工人',
};

// 角色说明（账号管理页的角色下拉与权限说明弹窗共用，避免文案两处维护）
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN: '全部模块 + 账号管理',
  SALES: '订单、客户、财务全部维护',
  FINANCE: '财务维护，订单与客户只读',
  WORKER: '仅订单只读',
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export function scopesOf(role: string | null | undefined): readonly Scope[] {
  return isUserRole(role) ? ROLE_SCOPES[role] : [];
}

export function hasScope(role: string | null | undefined, scope: Scope): boolean {
  return scopesOf(role).includes(scope);
}
