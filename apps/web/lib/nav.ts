// 侧边菜单的静态配置（design/平台布局.md §1.3）：
// 菜单清单集中在此维护，随 `product/平台布局.md` R-平台布局-001 菜单表更新而更新。
// 按业务领域分组，与业务领域一一对应；平台机制（登录、布局）不设分组，
// 修改密码与退出登录走顶栏头像下拉（归账号与权限领域）。
// 领域页面尚未实现的分组/菜单项标 pending（占位展示、不可点击），随该领域首个页面落地后去除。

export interface NavItem {
  title: string;
  /** 页面已实现时的入口；未实现为空 */
  href?: string;
  /** 页面尚未实现时不可点击 */
  pending?: boolean;
  /**
   * 「待建」徽标的唯一依据（product/平台布局.md R-平台布局-001）：
   * 领域需求文档未建 → true；需求文档已建但页面尚未实现 → false（如订单组）。
   */
  pendingBadge?: boolean;
}

export interface NavGroup {
  label: string;
  domain: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: '工作台',
    domain: 'finance',
    items: [{ title: '首页总览（月度毛利、现金流、近期动态）', href: '/admin' }],
  },
  {
    label: '客户',
    domain: 'customer',
    items: [{ title: '客户档案', pending: true }],
  },
  {
    label: '采购',
    domain: 'purchase',
    items: [
      { title: '供应商', pending: true },
      { title: '采购单', pending: true },
      { title: '采购付款', pending: true },
    ],
  },
  {
    label: '报价',
    domain: 'quote',
    items: [{ title: '报价单', pending: true }],
  },
  {
    label: '订单',
    domain: 'order',
    // 需求文档已建（product/order.md R-订单-001），不标「待建」；
    // 页面（列表 / 录入 / 详情）尚未实现，暂不可点
    items: [{ title: '销售单', pending: true, pendingBadge: false }],
  },
  {
    label: '生产',
    domain: 'production',
    items: [
      { title: '工单', pending: true },
      { title: '报工', pending: true },
    ],
  },
  {
    label: '库存',
    domain: 'inventory',
    items: [
      { title: '库存', pending: true },
      { title: '季度盘点', pending: true },
    ],
  },
  {
    label: '员工与工资',
    domain: 'payroll',
    items: [
      { title: '员工', pending: true },
      { title: '工资单', pending: true },
    ],
  },
  {
    label: '财务',
    domain: 'finance',
    items: [
      { title: '收款', pending: true },
      { title: '付款', pending: true },
      { title: '开票', pending: true },
      { title: '月度汇总', pending: true },
    ],
  },
];

/** 按当前路径反查面包屑（分组 / 菜单项标题） */
export function findNavByPath(pathname: string): { groupLabel: string; itemTitle: string } | null {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.href && pathname === item.href) {
        return { groupLabel: group.label, itemTitle: item.title };
      }
    }
  }
  return null;
}