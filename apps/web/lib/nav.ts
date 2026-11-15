import {
  ArrowDownToLineIcon,
  ArrowLeftRightIcon,
  ArrowUpFromLineIcon,
  BarChart3Icon,
  BoxesIcon,
  Building2Icon,
  ClipboardListIcon,
  FactoryIcon,
  FileTextIcon,
  HomeIcon,
  ListChecksIcon,
  ScrollTextIcon,
  ShoppingCartIcon,
  TruckIcon,
  UserCogIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';
import { hasScope, type FeatureCode, type Scope, type UserRole } from '@mcc/shared';

// 侧边菜单的静态配置（design/平台布局.md §1.3）：
// 菜单清单集中在此维护，随 `product/平台布局.md` R-平台布局-001 菜单表更新而更新。
// 菜单只登记已建领域分组；未建领域分组不列入（登记规则见 product/平台布局.md 菜单结构与领域归属）。
// 每项必须带图标（折叠为图标栏时只显示图标，见 product/平台布局.md 整体布局）。
// 图标全局不重复：首页、各业务分组、各菜单项之间不得复用同一图标（分组与其子项尤其不能同图标）。
// 菜单项声明 scope 与 feature：壳按「feature ∩ scope」过滤（product/账号与权限.md R-账号与权限-003）。

export interface NavItem {
  title: string;
  /** 折叠为图标栏时显示的图标（必填） */
  icon: LucideIcon;
  /** 页面入口 */
  href?: string;
  /** 访问该页面所需的 scope；为空表示登录即可见 */
  scope?: Scope;
  /** 所属可售功能；功能未开通时入口隐藏（基础功能可不填） */
  feature?: FeatureCode;
}

export interface NavGroup {
  label: string;
  domain: string;
  /** 分组图标（边栏折叠为图标栏时显示，点击可折叠/展开该组） */
  icon: LucideIcon;
  items: NavItem[];
}

// 首页（登录后落地页）：独立菜单项置顶，不属业务分组；静态欢迎页归 platform 领域
export const homeItem: NavItem = { title: '首页', icon: HomeIcon, href: '/admin' };

export const navGroups: NavGroup[] = [
  {
    label: '销售',
    domain: 'order',
    icon: ShoppingCartIcon,
    items: [
      { title: '销售单', icon: FileTextIcon, href: '/admin/sale-orders', scope: 'order:view', feature: 'order' },
      { title: '客户档案', icon: UsersIcon, href: '/admin/customers', scope: 'customer:view', feature: 'customer' },
    ],
  },
  {
    label: '采购',
    domain: 'purchase',
    icon: TruckIcon,
    items: [
      { title: '采购单', icon: ClipboardListIcon, href: '/admin/purchases', scope: 'purchase:view', feature: 'purchase' },
      { title: '供应商', icon: Building2Icon, href: '/admin/suppliers', scope: 'supplier:view', feature: 'supplier' },
    ],
  },
  {
    label: '生产',
    domain: 'production',
    icon: FactoryIcon,
    items: [
      { title: '原木领用', icon: ArrowDownToLineIcon, href: '/admin/production/issues', scope: 'production:view', feature: 'production' },
      { title: '方木产出', icon: ArrowUpFromLineIcon, href: '/admin/production/outputs', scope: 'production:view', feature: 'production' },
      { title: '库存', icon: BoxesIcon, href: '/admin/production/inventory', scope: 'inventory:view', feature: 'production' },
      { title: '库存盘点', icon: ListChecksIcon, href: '/admin/production/inventory/counts', scope: 'inventory:view', feature: 'production' },
    ],
  },
  {
    label: '财务',
    domain: 'finance',
    icon: WalletIcon,
    items: [
      { title: '资金流水', icon: ArrowLeftRightIcon, href: '/admin/finance/cash', scope: 'finance:view', feature: 'finance' },
      { title: '收支汇总', icon: BarChart3Icon, href: '/admin/finance/summary', scope: 'finance:view', feature: 'finance' },
    ],
  },
];

// 平台机制页面：不占侧边业务分组，入口在顶栏头像下拉（product/平台布局.md 权限可见性）
export const platformNavItems: NavItem[] = [
  { title: '账号管理', icon: UserCogIcon, href: '/admin/users', scope: 'account:manage', feature: 'account' },
  { title: '审计日志', icon: ScrollTextIcon, href: '/admin/audit-logs', scope: 'audit:view', feature: 'audit' },
];

// 按「feature ∩ scope」过滤侧边菜单：功能未开通或角色无 scope 均隐藏；无可见项的分组不渲染。
// features 为 null 表示尚未取得有效功能（登录 / 刷新响应未到），此时不做功能裁剪。
export function visibleNavGroups(
  role: UserRole | null,
  features: readonly FeatureCode[] | null = null,
): NavGroup[] {
  const featureOn = (feature?: FeatureCode): boolean =>
    !feature || features === null || features.includes(feature);
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => (!item.scope || hasScope(role, item.scope)) && featureOn(item.feature),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

/** 路径 → 所需可售功能（前端路由裁剪；服务端 FeatureGuard 仍是最终边界） */
export function featureForPath(pathname: string): FeatureCode | null {
  if (pathname.startsWith('/admin/audit-logs')) {
    return 'audit';
  }
  if (pathname.startsWith('/admin/users')) {
    return 'account';
  }
  if (pathname.startsWith('/admin/sale-orders')) {
    return 'order';
  }
  if (pathname.startsWith('/admin/customers')) {
    return 'customer';
  }
  if (pathname.startsWith('/admin/purchases')) {
    return 'purchase';
  }
  if (pathname.startsWith('/admin/suppliers')) {
    return 'supplier';
  }
  if (pathname.startsWith('/admin/production')) {
    return 'production';
  }
  if (pathname.startsWith('/admin/finance')) {
    return 'finance';
  }
  return null;
}

export interface NavMatch {
  groupLabel: string;
  itemTitle: string;
  itemHref?: string;
}

/** 按当前路径反查面包屑（分组 / 菜单项标题）；子路径归到所属菜单项。
 *  最长 href 优先：父子路径同前缀时只匹配最具体的一项（design/平台布局.md §1.3）。 */
export function findNavByPath(pathname: string): NavMatch | null {
  if (homeItem.href && pathname === homeItem.href) {
    return { groupLabel: '首页', itemTitle: '', itemHref: homeItem.href };
  }
  const candidates: Array<{ groupLabel: string; item: NavItem }> = [];
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`))) {
        candidates.push({ groupLabel: group.label, item });
      }
    }
  }
  for (const item of platformNavItems) {
    if (item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`))) {
      candidates.push({ groupLabel: '系统', item });
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => (b.item.href?.length ?? 0) - (a.item.href?.length ?? 0));
  const best = candidates[0]!;
  return { groupLabel: best.groupLabel, itemTitle: best.item.title, itemHref: best.item.href };
}

/** 移动 Web 路径 → 所需 scope（与 PC 共用同一套权限，不按端拆分；服务端守卫仍是最终边界） */
const MOBILE_MANAGE_PATHS: Array<[RegExp, Scope]> = [
  [/^\/m\/sale-orders\/(new|[^/]+\/edit)$/, 'order:manage'],
  [/^\/m\/customers\/(new|[^/]+\/edit)$/, 'customer:manage'],
  [/^\/m\/purchase\/orders\/(new|[^/]+\/edit)$/, 'purchase:manage'],
  [/^\/m\/purchase\/suppliers\/(new|[^/]+\/edit)$/, 'supplier:manage'],
  [/^\/m\/production\/issues\/(new|[^/]+\/edit)$/, 'production:manage'],
  [/^\/m\/production\/outputs\/(new|[^/]+\/edit)$/, 'production:manage'],
  [/^\/m\/production\/inventory\/counts\/new$/, 'inventory:manage'],
  [/^\/m\/finance\/cash\/(new|[^/]+\/edit)$/, 'finance:manage'],
];

export function scopeForMobilePath(pathname: string): Scope | null {
  for (const [pattern, scope] of MOBILE_MANAGE_PATHS) {
    if (pattern.test(pathname)) {
      return scope;
    }
  }
  if (pathname.startsWith('/m/sale-orders')) {
    return 'order:view';
  }
  if (pathname.startsWith('/m/customers')) {
    return 'customer:view';
  }
  // 销售二级入口本身只做分发，卡片的可见性由页面内 useCan 裁剪
  if (pathname === '/m/sales') {
    return null;
  }
  if (pathname.startsWith('/m/purchase/orders') || pathname === '/m/purchase') {
    return 'purchase:view';
  }
  if (pathname.startsWith('/m/purchase/suppliers')) {
    return 'supplier:view';
  }
  if (pathname === '/m/production') {
    return null;
  }
  if (pathname.startsWith('/m/production/issues')) {
    return 'production:view';
  }
  if (pathname.startsWith('/m/production/outputs')) {
    return 'production:view';
  }
  if (pathname.startsWith('/m/production/inventory')) {
    return 'inventory:view';
  }
  if (pathname.startsWith('/m/finance')) {
    return 'finance:view';
  }
  return null;
}

/** 路径 → 所需 scope（前端路由裁剪；服务端守卫仍是最终边界） */
export function scopeForPath(pathname: string): Scope | null {
  if (pathname === '/admin/users') {
    return 'account:manage';
  }
  if (pathname.startsWith('/admin/audit-logs')) {
    return 'audit:view';
  }
  if (pathname.startsWith('/admin/purchases')) {
    return /^\/admin\/purchases\/(new|[^/]+\/edit)$/.test(pathname)
      ? 'purchase:manage'
      : 'purchase:view';
  }
  if (pathname.startsWith('/admin/suppliers')) {
    return /^\/admin\/suppliers\/(new|[^/]+\/edit)$/.test(pathname)
      ? 'supplier:manage'
      : 'supplier:view';
  }
  if (pathname.startsWith('/admin/sale-orders')) {
    return /^\/admin\/sale-orders\/(new|[^/]+\/edit)$/.test(pathname)
      ? 'order:manage'
      : 'order:view';
  }
  if (pathname.startsWith('/admin/customers')) {
    return /^\/admin\/customers\/(new|[^/]+\/edit)$/.test(pathname)
      ? 'customer:manage'
      : 'customer:view';
  }
  if (pathname.startsWith('/admin/production/issues')) {
    return /^\/admin\/production\/issues\/(new|[^/]+\/edit)$/.test(pathname)
      ? 'production:manage'
      : 'production:view';
  }
  if (pathname.startsWith('/admin/production/outputs')) {
    return /^\/admin\/production\/outputs\/(new|[^/]+\/edit)$/.test(pathname)
      ? 'production:manage'
      : 'production:view';
  }
  if (pathname.startsWith('/admin/production/inventory')) {
    return pathname === '/admin/production/inventory/counts/new'
      ? 'inventory:manage'
      : 'inventory:view';
  }
  if (pathname.startsWith('/admin/finance')) {
    return 'finance:view';
  }
  return null;
}