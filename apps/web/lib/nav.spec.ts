import { describe, expect, it } from 'vitest';
import {
  findNavByPath,
  navGroups,
  platformNavItems,
  scopeForMobilePath,
  scopeForPath,
  visibleNavGroups,
} from './nav';

// 菜单配置约定（design/平台布局.md §1.3）：图标全局不重复——
// 各业务分组、各菜单项之间复用同一图标会让折叠图标栏无法区分，分组与其子项尤其不能同图标。
describe('导航图标', () => {
  it('分组与菜单项的图标互不重复', () => {
    const icons = [
      ...navGroups.flatMap((group) => [group.icon, ...group.items.map((item) => item.icon)]),
      ...platformNavItems.map((item) => item.icon),
    ];
    expect(new Set(icons).size).toBe(icons.length);
  });
});

// 菜单按角色 scope 裁剪（product/账号与权限.md R-账号与权限-003）
describe('菜单可见性', () => {
  it('管理员可见全部业务分组', () => {
    expect(visibleNavGroups('ADMIN').flatMap((group) => group.items)).toHaveLength(12);
  });

  it('工人只看到销售单', () => {
    const groups = visibleNavGroups('WORKER');
    expect(groups.map((group) => group.label)).toEqual(['销售']);
    expect(groups[0]?.items.map((item) => item.title)).toEqual(['销售单']);
  });

  it('财务看到设计、销售、采购、生产与财务，看不到账号管理（账号管理不在侧边菜单）', () => {
    expect(visibleNavGroups('FINANCE').map((group) => group.label)).toEqual([
      '设计',
      '销售',
      '采购',
      '生产',
      '财务',
    ]);
  });

  it('包装设计在独立的「设计」分组', () => {
    const design = visibleNavGroups('ADMIN').find((group) => group.label === '设计');
    expect(design?.items.map((item) => item.title)).toEqual(['包装设计']);
    expect(design?.items[0]?.href).toBe('/admin/packaging-design');
  });
});

describe('平台机制页', () => {
  it('审计日志入口仅 audit:view 可见', () => {
    const audit = platformNavItems.find((item) => item.href === '/admin/audit-logs');
    expect(audit?.scope).toBe('audit:view');
  });
});

// 当前菜单项高亮（design/平台布局.md §1.3）：最长 href 优先，
// /admin/production/inventory 是 /admin/production/inventory/counts 的前缀，只能点亮最具体一项。
describe('菜单匹配', () => {
  it('包装设计是设计分组的菜单项，也是当前阶段默认落地页', () => {
    expect(findNavByPath('/admin/packaging-design')).toEqual({
      groupLabel: '设计',
      itemTitle: '包装设计',
      itemHref: '/admin/packaging-design',
    });
  });

  it('父子同前缀时只匹配最具体的菜单项', () => {
    expect(findNavByPath('/admin/production/inventory/counts')?.itemHref).toBe(
      '/admin/production/inventory/counts',
    );
    expect(findNavByPath('/admin/production/inventory/counts/new')?.itemHref).toBe(
      '/admin/production/inventory/counts',
    );
    expect(findNavByPath('/admin/production/inventory')?.itemHref).toBe(
      '/admin/production/inventory',
    );
    expect(findNavByPath('/admin/production/issues/abc')?.itemHref).toBe(
      '/admin/production/issues',
    );
    expect(findNavByPath('/admin/production/outputs')?.itemHref).toBe(
      '/admin/production/outputs',
    );
  });
});

describe('路由 scope', () => {
  it('新建 / 编辑页要求 manage，列表与详情要求 view', () => {
    expect(scopeForPath('/admin/sale-orders')).toBe('order:view');
    expect(scopeForPath('/admin/sale-orders/new')).toBe('order:manage');
    expect(scopeForPath('/admin/sale-orders/abc/edit')).toBe('order:manage');
    expect(scopeForPath('/admin/customers')).toBe('customer:view');
    expect(scopeForPath('/admin/customers/new')).toBe('customer:manage');
    expect(scopeForPath('/admin/customers/abc/edit')).toBe('customer:manage');
    expect(scopeForPath('/admin/packaging-design')).toBe('packaging:view');
    expect(scopeForPath('/admin/packaging-design/new')).toBe('packaging:manage');
    expect(scopeForPath('/admin/packaging-design/abc')).toBe('packaging:view');
    expect(scopeForPath('/admin/packaging-design/abc/report')).toBe('packaging:view');
    expect(scopeForPath('/admin/purchases')).toBe('purchase:view');
    expect(scopeForPath('/admin/purchases/new')).toBe('purchase:manage');
    expect(scopeForPath('/admin/purchases/abc/edit')).toBe('purchase:manage');
    expect(scopeForPath('/admin/suppliers')).toBe('supplier:view');
    expect(scopeForPath('/admin/suppliers/new')).toBe('supplier:manage');
    expect(scopeForPath('/admin/suppliers/abc/edit')).toBe('supplier:manage');
    expect(scopeForPath('/admin/users')).toBe('account:manage');
    expect(scopeForPath('/admin/audit-logs')).toBe('audit:view');
    expect(scopeForPath('/admin/production/batches')).toBe('production:view');
    expect(scopeForPath('/admin/production/batches/abc')).toBe('production:view');
    expect(scopeForPath('/admin/production/issues')).toBe('production:view');
    expect(scopeForPath('/admin/production/issues/new')).toBe('production:manage');
    expect(scopeForPath('/admin/production/issues/abc/edit')).toBe('production:manage');
    expect(scopeForPath('/admin/production/outputs')).toBe('production:view');
    expect(scopeForPath('/admin/production/outputs/new')).toBe('production:manage');
    expect(scopeForPath('/admin/production/outputs/abc/edit')).toBe('production:manage');
    expect(scopeForPath('/admin/production/inventory')).toBe('inventory:view');
    expect(scopeForPath('/admin/production/inventory/opening')).toBe('inventory:view');
    expect(scopeForPath('/admin/production/inventory/counts')).toBe('inventory:view');
    expect(scopeForPath('/admin/production/inventory/counts/abc')).toBe('inventory:view');
    expect(scopeForPath('/admin/production/inventory/counts/new')).toBe('inventory:manage');
    expect(scopeForPath('/admin')).toBeNull();
  });
});

// 移动 Web 路由 scope（技术方案 §8.2：PC 与移动共用同一套 scope，不按端拆分）
describe('移动路由 scope', () => {
  it('新建 / 编辑页要求 manage，列表与详情要求 view', () => {
    expect(scopeForMobilePath('/m/sale-orders')).toBe('order:view');
    expect(scopeForMobilePath('/m/sale-orders/new')).toBe('order:manage');
    expect(scopeForMobilePath('/m/sale-orders/abc/edit')).toBe('order:manage');
    expect(scopeForMobilePath('/m/customers/new')).toBe('customer:manage');
    expect(scopeForMobilePath('/m/customers/abc')).toBe('customer:view');
    expect(scopeForMobilePath('/m/purchase')).toBe('purchase:view');
    expect(scopeForMobilePath('/m/purchase/orders/new')).toBe('purchase:manage');
    expect(scopeForMobilePath('/m/purchase/orders/abc/edit')).toBe('purchase:manage');
    expect(scopeForMobilePath('/m/purchase/suppliers/new')).toBe('supplier:manage');
    expect(scopeForMobilePath('/m/purchase/suppliers/abc')).toBe('supplier:view');
    expect(scopeForMobilePath('/m/finance/cash/new')).toBe('finance:manage');
    expect(scopeForMobilePath('/m/finance/cash/abc/edit')).toBe('finance:manage');
    expect(scopeForMobilePath('/m/finance/summary')).toBe('finance:view');
    expect(scopeForMobilePath('/m/production')).toBeNull();
    expect(scopeForMobilePath('/m/production/batches')).toBe('production:view');
    expect(scopeForMobilePath('/m/production/batches/abc')).toBe('production:view');
    expect(scopeForMobilePath('/m/production/issues')).toBe('production:view');
    expect(scopeForMobilePath('/m/production/issues/new')).toBe('production:manage');
    expect(scopeForMobilePath('/m/production/issues/abc/edit')).toBe('production:manage');
    expect(scopeForMobilePath('/m/production/outputs')).toBe('production:view');
    expect(scopeForMobilePath('/m/production/outputs/new')).toBe('production:manage');
    expect(scopeForMobilePath('/m/production/outputs/abc/edit')).toBe('production:manage');
    expect(scopeForMobilePath('/m/production/inventory')).toBe('inventory:view');
    expect(scopeForMobilePath('/m/production/inventory/opening')).toBe('inventory:view');
    expect(scopeForMobilePath('/m/production/inventory/counts')).toBe('inventory:view');
    expect(scopeForMobilePath('/m/production/inventory/counts/abc')).toBe('inventory:view');
    expect(scopeForMobilePath('/m/production/inventory/counts/new')).toBe('inventory:manage');
  });

  it('销售二级入口与移动首页登录即可访问', () => {
    expect(scopeForMobilePath('/m/sales')).toBeNull();
    expect(scopeForMobilePath('/m')).toBeNull();
  });
});
