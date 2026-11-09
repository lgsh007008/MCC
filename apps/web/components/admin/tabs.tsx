'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findNavByPath } from '@/lib/nav';
import {
  HOME_PATH,
  clearTabsStorage,
  deriveTabTitle,
  initialTabsState,
  loadTabs,
  nextPathAfterClose,
  saveTabs,
  tabsReducer,
  type TabsState,
} from '@/lib/tabs';
import { usePageBreadcrumb } from './page-breadcrumb';

// 多标签页（product/平台布局.md「多标签页」；design/平台布局.md §1.6）：
// 状态由 provider 持有并持久化到 sessionStorage；壳层负责两行顶栏，本文件只做标签栏与状态。

interface TabsContextValue {
  state: TabsState;
  activate: (path: string) => void;
  close: (path: string) => void;
  reset: () => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function useTabs(): TabsContextValue {
  const value = useContext(TabsContext);
  if (!value) {
    throw new Error('useTabs 必须在 TabsProvider 内使用');
  }
  return value;
}

export function TabsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const crumbs = usePageBreadcrumb()?.crumbs ?? [];
  const [state, dispatch] = useReducer(tabsReducer, undefined, initialTabsState);
  const hydrated = useRef(false);
  // reset 后禁用持久化，避免「清空存储 → 状态回写 → 又把首页存回去」的竞态
  const persistDisabled = useRef(false);

  // 标题：面包屑各级标识拼接，回退菜单名（页面未注入页面标识时）
  const fallbackTitle = useMemo(() => {
    const match = findNavByPath(pathname);
    return match?.itemTitle || match?.groupLabel || pathname;
  }, [pathname]);
  const title = useMemo(
    () => deriveTabTitle(crumbs.map((crumb) => crumb.title), fallbackTitle),
    [crumbs, fallbackTitle],
  );

  // 刷新恢复：首帧用初始态渲染（避免服务端/客户端不一致），挂载后再用会话存储覆盖
  useEffect(() => {
    const loaded = loadTabs();
    if (loaded) {
      dispatch({ type: 'restore', tabs: loaded.tabs, activePath: loaded.activePath });
    }
    hydrated.current = true;
  }, []);

  // 路径或标题变化：激活或新增标签（浏览器前进后退、深链接同样生效）
  useEffect(() => {
    dispatch({ type: 'sync', path: pathname, title, now: Date.now() });
  }, [pathname, title]);

  useEffect(() => {
    if (hydrated.current && !persistDisabled.current) {
      saveTabs(state);
    }
  }, [state]);

  const activate = useCallback(
    (path: string) => {
      if (path !== pathname) {
        router.push(path);
      }
    },
    [pathname, router],
  );

  const close = useCallback(
    (path: string) => {
      const target = nextPathAfterClose(state, path);
      dispatch({ type: 'close', path });
      if (target) {
        router.push(target);
      }
    },
    [state, router],
  );

  const reset = useCallback(() => {
    persistDisabled.current = true;
    clearTabsStorage();
    dispatch({ type: 'reset' });
  }, []);

  const value = useMemo(
    () => ({ state, activate, close, reset }),
    [state, activate, close, reset],
  );
  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function TabBar(): React.ReactElement {
  const { state, activate, close } = useTabs();
  const activeRef = useRef<HTMLDivElement>(null);

  // 激活标签滚入可见区域（横向滚动时）
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [state.activePath]);

  return (
    <div role="tablist" aria-label="页面标签" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {state.tabs.map((tab) => {
        const active = tab.path === state.activePath;
        const closable = tab.path !== HOME_PATH;
        return (
          <div
            key={tab.path}
            ref={active ? activeRef : undefined}
            className={cn(
              'group flex h-8 max-w-45 shrink-0 items-center rounded-md pl-2.5 pr-1 text-sm transition-colors',
              active
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={tab.title}
              className="max-w-36 truncate text-left"
              onClick={() => activate(tab.path)}
            >
              {tab.title}
            </button>
            {closable ? (
              <button
                type="button"
                aria-label={`关闭 ${tab.title}`}
                title={`关闭 ${tab.title}`}
                className={cn(
                  'ml-0.5 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground',
                  active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
                onClick={() => close(tab.path)}
              >
                <XIcon className="size-3.5" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
