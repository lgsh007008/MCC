import { describe, expect, it } from 'vitest';
import { homeItem, navGroups } from './nav';

// 菜单配置约定（design/平台布局.md §1.3）：图标全局不重复——
// 首页、各业务分组、各菜单项之间复用同一图标会让折叠图标栏无法区分，分组与其子项尤其不能同图标。
describe('导航图标', () => {
  it('首页、分组与菜单项的图标互不重复', () => {
    const icons = [
      homeItem.icon,
      ...navGroups.flatMap((group) => [group.icon, ...group.items.map((item) => item.icon)]),
    ];
    expect(new Set(icons).size).toBe(icons.length);
  });
});
