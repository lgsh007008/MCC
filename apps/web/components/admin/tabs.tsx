'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  // 首帧只渲染初始态；restored 置真后才允许持久化，避免把初始态覆盖进会话存储
  const [restored, setRestored] = useState(false);
  // reset 后禁用持久化，避免「清空存储 → 状态回写 → 又把首页存回去」的竞态
  const persistDisabled = useRef(false);

  // 标题：菜单项名 + 面包屑各级标识（如「销售单 / SO-2026-001 / 编辑」），回退路径
  const menuTitle = useMemo(() => {
    const match = findNavByPath(pathname);
    return match?.itemTitle || match?.groupLabel || '';
  }, [pathname]);
  const title = useMemo(
    () => deriveTabTitle(menuTitle, crumbs.map((crumb) => crumb.title), pathname),
    [menuTitle, crumbs, pathname],
  );

  // 刷新恢复：首帧用初始态渲染（避免服务端/客户端不一致），挂载后再用会话存储覆盖。
  // 同一次提交里 restore 与 restored 一起生效，之后才允许持久化，防止初始态回写覆盖已保存标签。
  useEffect(() => {
    const loaded = loadTabs();
    if (loaded) {
      dispatch({ type: 'restore', tabs: loaded.tabs, activePath: loaded.activePath });
    }
    setRestored(true);
  }, []);

  // 路径或标题变化：激活或新增标签（浏览器前进后退、深链接同样生效）
  useEffect(() => {
    dispatch({ type: 'sync', path: pathname, title, now: Date.now() });
  }, [pathname, title]);

  useEffect(() => {
    if (restored && !persistDisabled.current) {
      saveTabs(state);
    }
  }, [state, restored]);

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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // 是否可左右滚动（按钮只在溢出时出现，到边界禁用）
  const updateScrollState = useCallback((): void => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(max > 1 && el.scrollLeft < max - 1);
  }, []);

  // 激活标签滚入可见区域：只调整标签栏自身滚动，避免连带滚动 document。
  useEffect(() => {
    const tab = activeRef.current;
    const container = scrollerRef.current;
    if (!tab || !container) {
      return;
    }
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < container.scrollLeft) {
      container.scrollLeft = left;
    } else if (right > container.scrollLeft + container.clientWidth) {
      container.scrollLeft = right - container.clientWidth;
    }
    updateScrollState();
  }, [state.activePath, state.tabs.length, updateScrollState]);

  // 标签数量或容器尺寸变化后刷新按钮可用性
  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => updateScrollState());
    observer.observe(el);
    return () => observer.disconnect();
  }, [state.tabs.length, updateScrollState]);

  // 一次滚动约可视宽度的 80%，标签多时不必逐个点
  const scrollByPage = (direction: -1 | 1): void => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
    window.setTimeout(updateScrollState, 320);
  };

  const showArrows = canLeft || canRight;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {showArrows ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="左移标签"
          title="左移标签"
          disabled={!canLeft}
          onClick={() => scrollByPage(-1)}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
      ) : null}
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label="页面标签"
        onScroll={updateScrollState}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
      {state.tabs.map((tab) => {
        const active = tab.path === state.activePath;
        const closable = tab.path !== HOME_PATH;
        return (
          <div
            key={tab.path}
            ref={active ? activeRef : undefined}
            className={cn(
              'group flex h-8 max-w-55 shrink-0 items-center rounded-md pl-2.5 pr-1 text-sm transition-colors',
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
              className="max-w-44 truncate text-left"
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
      {showArrows ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="右移标签"
          title="右移标签"
          disabled={!canRight}
          onClick={() => scrollByPage(1)}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
