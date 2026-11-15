import { describe, expect, it } from 'vitest';
import { opsNavItems, scopeForOpsPath, visibleOpsNav } from './ops-nav';

// 平台导航配置自检（design/平台布局.md §1.9）：
// 图标全局不重复；平台管理员可见全部菜单；路由 scope 映射与文档一致。
describe('ops nav', () => {
  it('图标全局不重复', () => {
    const icons = opsNavItems.map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('平台管理员可见全部菜单', () => {
    expect(visibleOpsNav('PLATFORM_ADMIN')).toHaveLength(opsNavItems.length);
    expect(visibleOpsNav(null)).toHaveLength(0);
  });

  it('路由 scope 映射', () => {
    expect(scopeForOpsPath('/ops/tenants')).toBe('platform:tenant:view');
    expect(scopeForOpsPath('/ops/tenants/new')).toBe('platform:tenant:manage');
    expect(scopeForOpsPath('/ops/tenants/abc')).toBe('platform:tenant:view');
    expect(scopeForOpsPath('/ops/plans')).toBe('platform:tenant:view');
    expect(scopeForOpsPath('/ops/accounts')).toBe('platform:account:manage');
    expect(scopeForOpsPath('/ops/audit-logs')).toBe('platform:audit:view');
    expect(scopeForOpsPath('/ops')).toBeNull();
  });
});
