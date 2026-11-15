import { Building2Icon, LayersIcon, ScrollTextIcon, ShieldCheckIcon, type LucideIcon } from 'lucide-react';
import { hasPlatformScope, type PlatformRole, type PlatformScope } from '@mcc/shared';

// 平台运营后台导航（design/平台布局.md §1.9）：
// 静态配置集中维护；每项必带图标且图标不重复；菜单按平台 scope 裁剪。
export interface OpsNavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  scope: PlatformScope;
}

export const opsNavItems: OpsNavItem[] = [
  { title: '租户管理', href: '/ops/tenants', icon: Building2Icon, scope: 'platform:tenant:view' },
  { title: '套餐管理', href: '/ops/plans', icon: LayersIcon, scope: 'platform:tenant:view' },
  { title: '平台账号', href: '/ops/accounts', icon: ShieldCheckIcon, scope: 'platform:account:manage' },
  { title: '平台审计', href: '/ops/audit-logs', icon: ScrollTextIcon, scope: 'platform:audit:view' },
];

export function visibleOpsNav(role: PlatformRole | null): OpsNavItem[] {
  return opsNavItems.filter((item) => hasPlatformScope(role, item.scope));
}

/** /ops 路径 → 所需平台 scope（前端裁剪；服务端 PlatformAuthGuard 是最终边界） */
export function scopeForOpsPath(pathname: string): PlatformScope | null {
  if (pathname === '/ops' || pathname === '/ops/login') {
    return null;
  }
  if (pathname === '/ops/tenants/new') {
    return 'platform:tenant:manage';
  }
  if (pathname.startsWith('/ops/tenants')) {
    return 'platform:tenant:view';
  }
  if (pathname.startsWith('/ops/plans')) {
    return 'platform:tenant:view';
  }
  if (pathname.startsWith('/ops/accounts')) {
    return 'platform:account:manage';
  }
  if (pathname.startsWith('/ops/audit-logs')) {
    return 'platform:audit:view';
  }
  return null;
}

/** 面包屑标题：按当前路径匹配菜单项 */
export function findOpsNavByPath(pathname: string): OpsNavItem | null {
  return (
    opsNavItems.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    ) ?? null
  );
}
