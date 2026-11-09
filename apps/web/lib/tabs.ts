// 多标签页状态（product/平台布局.md「多标签页」；design/平台布局.md §1.6）：
// 纯逻辑集中在此（不依赖 React / 路由），便于单测；壳层只负责渲染与派发。

export const HOME_PATH = '/admin';
export const HOME_TITLE = '首页';
/** 标签上限：超出时淘汰最久未使用的标签（首页不参与淘汰） */
export const MAX_TABS = 12;
const STORAGE_KEY = 'mcc.tabs.v1';

export interface TabItem {
  path: string;
  title: string;
  /** 最近一次激活时间戳，用于 LRU 淘汰 */
  lastActiveAt: number;
}

export interface TabsState {
  tabs: TabItem[];
  activePath: string;
}

export type TabsAction =
  | { type: 'sync'; path: string; title: string; now: number }
  | { type: 'close'; path: string }
  | { type: 'restore'; tabs: TabItem[]; activePath: string }
  | { type: 'reset' };

export function initialTabsState(): TabsState {
  return {
    tabs: [{ path: HOME_PATH, title: HOME_TITLE, lastActiveAt: 0 }],
    activePath: HOME_PATH,
  };
}

/** 标签标题：菜单项名 + 页面面包屑各级标识，以「 / 」拼接（如「销售单 / SO-2026-001 / 编辑」） */
export function deriveTabTitle(menuTitle: string, crumbTitles: string[], fallback: string): string {
  const parts = [menuTitle, ...crumbTitles].map((title) => title.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : fallback;
}

/** 关闭标签后的落点：右邻 → 左邻 → 首页（供壳层导航，纯函数便于单测） */
export function nextPathAfterClose(state: TabsState, path: string): string | null {
  if (path === HOME_PATH) {
    return null;
  }
  const index = state.tabs.findIndex((tab) => tab.path === path);
  if (index < 0) {
    return null;
  }
  if (path !== state.activePath) {
    return null;
  }
  const rest = state.tabs.filter((tab) => tab.path !== path);
  return rest[index]?.path ?? rest[index - 1]?.path ?? HOME_PATH;
}

function sanitizeTabs(tabs: TabItem[]): TabItem[] {
  const seen = new Set<string>([HOME_PATH]);
  const result: TabItem[] = [
    { path: HOME_PATH, title: HOME_TITLE, lastActiveAt: 0 },
  ];
  for (const tab of tabs) {
    if (!tab?.path || seen.has(tab.path)) {
      continue;
    }
    seen.add(tab.path);
    result.push({
      path: tab.path,
      title: tab.title?.trim() || tab.path,
      lastActiveAt: Number(tab.lastActiveAt) || 0,
    });
  }
  if (result.length > MAX_TABS) {
    // 超限时保留首页 + 最近使用的若干个，保持原有顺序
    const keep = new Set(
      result
        .filter((tab) => tab.path !== HOME_PATH)
        .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
        .slice(0, MAX_TABS - 1)
        .map((tab) => tab.path),
    );
    return result.filter((tab) => tab.path === HOME_PATH || keep.has(tab.path));
  }
  return result;
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'sync': {
      const existing = state.tabs.find((tab) => tab.path === action.path);
      if (existing) {
        // 已存在：激活并刷新最近使用时间；标题随面包屑变化同步回写
        const title = action.title.trim() || existing.title;
        return {
          tabs: state.tabs.map((tab) =>
            tab.path === action.path ? { ...tab, title, lastActiveAt: action.now } : tab,
          ),
          activePath: action.path,
        };
      }
      let tabs = [...state.tabs, { path: action.path, title: action.title, lastActiveAt: action.now }];
      if (tabs.length > MAX_TABS) {
        const candidates = tabs.filter(
          (tab) => tab.path !== HOME_PATH && tab.path !== action.path,
        );
        if (candidates.length > 0) {
          const lru = candidates.reduce((a, b) => (b.lastActiveAt < a.lastActiveAt ? b : a));
          tabs = tabs.filter((tab) => tab.path !== lru.path);
        }
      }
      return { tabs, activePath: action.path };
    }
    case 'close': {
      if (action.path === HOME_PATH || !state.tabs.some((tab) => tab.path === action.path)) {
        return state;
      }
      const nextPath = nextPathAfterClose(state, action.path);
      return {
        tabs: state.tabs.filter((tab) => tab.path !== action.path),
        activePath: nextPath ?? state.activePath,
      };
    }
    case 'restore': {
      const tabs = sanitizeTabs(action.tabs ?? []);
      const activePath = tabs.some((tab) => tab.path === action.activePath)
        ? action.activePath
        : HOME_PATH;
      return { tabs, activePath };
    }
    case 'reset':
      return initialTabsState();
  }
}

/** 会话内持久化（刷新保留；登出/改密后清空） */
export function loadTabs(): { tabs: TabItem[]; activePath: string } | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { tabs?: TabItem[]; activePath?: string };
    if (!Array.isArray(parsed.tabs)) {
      return null;
    }
    return { tabs: parsed.tabs, activePath: parsed.activePath ?? HOME_PATH };
  } catch {
    return null;
  }
}

export function saveTabs(state: TabsState): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tabs: state.tabs, activePath: state.activePath }),
    );
  } catch {
    // 存储不可用（隐私模式等）时静默降级为内存态
  }
}

export function clearTabsStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上
  }
}
