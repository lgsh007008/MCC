import {
  BarChart3Icon,
  ContactIcon,
  FileTextIcon,
  HomeIcon,
  ReceiptTextIcon,
  ShoppingCartIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';

// 侧边菜单的静态配置（design/平台布局.md §1.3）：
// 菜单清单集中在此维护，随 `product/平台布局.md` R-平台布局-001 菜单表更新而更新。
// 菜单只登记已建领域分组；未建领域分组不列入（登记规则见 product/平台布局.md 菜单结构与领域归属）。
// 每项必须带图标（折叠为图标栏时只显示图标，见 product/平台布局.md 整体布局）。
// 图标全局不重复：首页、各业务分组、各菜单项之间不得复用同一图标（分组与其子项尤其不能同图标）。

export interface NavItem {
  title: string;
  /** 折叠为图标栏时显示的图标（必填） */
  icon: LucideIcon;
  /** 页面已实现时的入口；未实现为空 */
  href?: string;
  /** 页面尚未实现时不可点击 */
  pending?: boolean;
  /**
   * 「待建」徽标的唯一依据（product/平台布局.md R-平台布局-001）：
   * 领域需求文档未建 → true；需求文档已建但页面尚未实现 → false。
   */
  pendingBadge?: boolean;
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
    label: '订单',
    domain: 'order',
    icon: ShoppingCartIcon,
    items: [{ title: '销售单', icon: FileTextIcon, href: '/admin/sale-orders' }],
  },
  {
    label: '客户',
    domain: 'customer',
    icon: ContactIcon,
    items: [{ title: '客户档案', icon: UsersIcon, href: '/admin/customers' }],
  },
  {
    label: '财务',
    domain: 'finance',
    icon: WalletIcon,
    items: [
      { title: '财务台账', icon: ReceiptTextIcon, href: '/admin/finance/events' },
      { title: '收支汇总', icon: BarChart3Icon, href: '/admin/finance/summary' },
    ],
  },
];

export interface NavMatch {
  groupLabel: string;
  itemTitle: string;
  itemHref?: string;
}

/** 按当前路径反查面包屑（分组 / 菜单项标题）；子路径归到所属菜单项 */
export function findNavByPath(pathname: string): NavMatch | null {
  if (homeItem.href && pathname === homeItem.href) {
    return { groupLabel: '首页', itemTitle: '', itemHref: homeItem.href };
  }
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`))) {
        return { groupLabel: group.label, itemTitle: item.title, itemHref: item.href };
      }
    }
  }
  return null;
}