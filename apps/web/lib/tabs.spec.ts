import { describe, expect, it } from 'vitest';
import {
  HOME_PATH,
  HOME_TITLE,
  MAX_TABS,
  deriveTabTitle,
  initialTabsState,
  nextPathAfterClose,
  tabsReducer,
  type TabsState,
} from './tabs';

const stateWith = (paths: string[], activePath?: string): TabsState => {
  const tabs = [
    { path: HOME_PATH, title: HOME_TITLE, lastActiveAt: 0 },
    ...paths.map((path, index) => ({ path, title: path, lastActiveAt: index + 1 })),
  ];
  return { tabs, activePath: activePath ?? paths[paths.length - 1] ?? HOME_PATH };
};

describe('deriveTabTitle', () => {
  it('拼接面包屑各级标识', () => {
    expect(deriveTabTitle(['SO-2026-001', '编辑'], '销售单')).toBe('SO-2026-001 / 编辑');
  });

  it('无页面标识时回退菜单名', () => {
    expect(deriveTabTitle([], '销售单')).toBe('销售单');
    expect(deriveTabTitle(['  '], '销售单')).toBe('销售单');
  });
});

describe('tabsReducer sync', () => {
  it('新路径追加标签并激活', () => {
    const next = tabsReducer(initialTabsState(), {
      type: 'sync',
      path: '/admin/sale-orders',
      title: '销售单',
      now: 10,
    });
    expect(next.tabs.map((tab) => tab.path)).toEqual([HOME_PATH, '/admin/sale-orders']);
    expect(next.activePath).toBe('/admin/sale-orders');
  });

  it('重复进入同一路径只激活并刷新最近使用时间', () => {
    const state = stateWith(['/admin/sale-orders', '/admin/sale-orders/new'], HOME_PATH);
    const next = tabsReducer(state, {
      type: 'sync',
      path: '/admin/sale-orders',
      title: '销售单',
      now: 99,
    });
    expect(next.tabs).toHaveLength(3);
    expect(next.activePath).toBe('/admin/sale-orders');
    expect(next.tabs.find((tab) => tab.path === '/admin/sale-orders')?.lastActiveAt).toBe(99);
  });

  it('超过上限时淘汰最久未使用且非首页的标签', () => {
    const paths = Array.from({ length: MAX_TABS - 1 }, (_, i) => `/admin/p${i + 1}`);
    const state = stateWith(paths, HOME_PATH);
    // 先把 p1 最近激活时间调成最小
    state.tabs = state.tabs.map((tab) =>
      tab.path === '/admin/p1' ? { ...tab, lastActiveAt: -1 } : tab,
    );
    const next = tabsReducer(state, {
      type: 'sync',
      path: '/admin/new',
      title: '新页面',
      now: 100,
    });
    expect(next.tabs).toHaveLength(MAX_TABS);
    expect(next.tabs.some((tab) => tab.path === '/admin/p1')).toBe(false);
    expect(next.tabs.some((tab) => tab.path === '/admin/new')).toBe(true);
    expect(next.tabs[0]?.path).toBe(HOME_PATH);
  });
});

describe('tabsReducer close', () => {
  it('关闭当前标签跳到右邻', () => {
    const state = stateWith(['/a', '/b', '/c'], '/b');
    const next = tabsReducer(state, { type: 'close', path: '/b' });
    expect(next.tabs.map((tab) => tab.path)).toEqual([HOME_PATH, '/a', '/c']);
    expect(next.activePath).toBe('/c');
  });

  it('关闭最右标签跳到左邻', () => {
    const state = stateWith(['/a', '/b', '/c'], '/c');
    const next = tabsReducer(state, { type: 'close', path: '/c' });
    expect(next.activePath).toBe('/b');
  });

  it('只有首页外的最后一个标签时回首页', () => {
    const state = stateWith(['/a'], '/a');
    const next = tabsReducer(state, { type: 'close', path: '/a' });
    expect(next.tabs.map((tab) => tab.path)).toEqual([HOME_PATH]);
    expect(next.activePath).toBe(HOME_PATH);
  });

  it('关闭非当前标签不改变当前页', () => {
    const state = stateWith(['/a', '/b'], '/b');
    const next = tabsReducer(state, { type: 'close', path: '/a' });
    expect(next.activePath).toBe('/b');
    expect(next.tabs.map((tab) => tab.path)).toEqual([HOME_PATH, '/b']);
  });

  it('首页不可关闭', () => {
    const state = stateWith(['/a'], '/a');
    const next = tabsReducer(state, { type: 'close', path: HOME_PATH });
    expect(next).toBe(state);
  });
});

describe('tabsReducer restore / reset', () => {
  it('标题变化时经 sync 回写（页面面包屑后到）', () => {
    const state = tabsReducer(initialTabsState(), {
      type: 'sync',
      path: '/admin/sale-orders/new',
      title: '销售单',
      now: 1,
    });
    const next = tabsReducer(state, {
      type: 'sync',
      path: '/admin/sale-orders/new',
      title: '新建',
      now: 2,
    });
    expect(next.tabs.find((tab) => tab.path === '/admin/sale-orders/new')?.title).toBe('新建');
  });

  it('负载还原时校正非法数据并保证首页在首位', () => {
    const next = tabsReducer(initialTabsState(), {
      type: 'restore',
      tabs: [
        { path: '/b', title: 'B', lastActiveAt: 2 },
        { path: '/b', title: 'B 重复', lastActiveAt: 3 },
        { path: HOME_PATH, title: '不合法首页标题', lastActiveAt: 9 },
      ],
      activePath: '/b',
    });
    expect(next.tabs.map((tab) => tab.path)).toEqual([HOME_PATH, '/b']);
    expect(next.tabs[0]?.title).toBe(HOME_TITLE);
    expect(next.activePath).toBe('/b');
  });

  it('还原时当前路径不存在则回首页', () => {
    const next = tabsReducer(initialTabsState(), {
      type: 'restore',
      tabs: [{ path: '/a', title: 'A', lastActiveAt: 1 }],
      activePath: '/missing',
    });
    expect(next.activePath).toBe(HOME_PATH);
  });

  it('reset 回到仅首页', () => {
    const state = stateWith(['/a', '/b'], '/b');
    expect(tabsReducer(state, { type: 'reset' })).toEqual(initialTabsState());
  });
});

describe('nextPathAfterClose', () => {
  it('非当前标签返回 null（无需导航）', () => {
    const state = stateWith(['/a', '/b'], '/b');
    expect(nextPathAfterClose(state, '/a')).toBeNull();
  });

  it('当前标签返回右邻', () => {
    const state = stateWith(['/a', '/b', '/c'], '/b');
    expect(nextPathAfterClose(state, '/b')).toBe('/c');
  });
});
