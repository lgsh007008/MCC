import { describe, expect, it } from 'vitest';
import { homeItem, navGroups, platformNavItems, scopeForPath, visibleNavGroups } from './nav';

// 菜单配置约定（design/平台布局.md §1.3）：图标全局不重复——
// 首页、各业务分组、各菜单项之间复用同一图标会让折叠图标栏无法区分，分组与其子项尤其不能同图标。
describe('导航图标', () => {
  it('首页、分组与菜单项的图标互不重复', () => {
    const icons = [
      homeItem.icon,
      ...navGroups.flatMap((group) => [group.icon, ...group.items.map((item) => item.icon)]),
      ...platformNavItems.map((item) => item.icon),
    ];
    expect(new Set(icons).size).toBe(icons.length);
  });
});

// 菜单按角色 scope 裁剪（product/账号与权限.md R-账号与权限-003）
describe('菜单可见性', () => {
  it('管理员可见全部业务分组', () => {
    expect(visibleNavGroups('ADMIN').flatMap((group) => group.items)).toHaveLength(4);
  });

  it('工人只看到销售单', () => {
    const groups = visibleNavGroups('WORKER');
    expect(groups.map((group) => group.label)).toEqual(['订单']);
    expect(groups[0]?.items.map((item) => item.title)).toEqual(['销售单']);
  });

  it('财务看到订单、客户与财务，看不到账号管理（账号管理不在侧边菜单）', () => {
    expect(visibleNavGroups('FINANCE').map((group) => group.label)).toEqual([
      '订单',
      '客户',
      '财务',
    ]);
  });
});

describe('平台机制页', () => {
  it('审计日志入口仅 audit:view 可见', () => {
    const audit = platformNavItems.find((item) => item.href === '/admin/audit-logs');
    expect(audit?.scope).toBe('audit:view');
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
    expect(scopeForPath('/admin/users')).toBe('account:manage');
    expect(scopeForPath('/admin/audit-logs')).toBe('audit:view');
    expect(scopeForPath('/admin')).toBeNull();
  });
});
