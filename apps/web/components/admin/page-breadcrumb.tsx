'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// 页面级面包屑标识（product/平台布局.md 整体布局）：
// 页面经 usePageCrumb 向壳注入当前页层级（如详情 = 单号；编辑 = 单号 / 编辑；新建 = 新建），
// 壳统一渲染：上级可点击、最后一项为当前页纯文本。design/平台布局.md §1.5 壳层。

export interface PageCrumb {
  title: string;
  href?: string;
}

interface PageBreadcrumbState {
  crumbs: PageCrumb[];
  setCrumbs: (crumbs: PageCrumb[]) => void;
}

const PageBreadcrumbContext = createContext<PageBreadcrumbState | null>(null);

const sameCrumbs = (a: PageCrumb[], b: PageCrumb[]): boolean =>
  a.length === b.length &&
  a.every((item, i) => item.title === b[i]?.title && item.href === b[i]?.href);

export function PageBreadcrumbProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [crumbs, setCrumbsState] = useState<PageCrumb[]>([]);
  // 内容相同则保持原引用，避免页面每次渲染触发壳重复更新
  const setCrumbs = useCallback((next: PageCrumb[]) => {
    setCrumbsState((prev) => (sameCrumbs(prev, next) ? prev : next));
  }, []);
  const value = useMemo(() => ({ crumbs, setCrumbs }), [crumbs, setCrumbs]);
  return (
    <PageBreadcrumbContext.Provider value={value}>{children}</PageBreadcrumbContext.Provider>
  );
}

/** 壳内消费：读取页面注入的面包屑标识 */
export function usePageBreadcrumb(): PageBreadcrumbState | null {
  return useContext(PageBreadcrumbContext);
}

/** 页面内注入：crumbs 变化时更新；仅在卸载时清空（cleanup 不得每次重渲染都清，否则死循环） */
export function usePageCrumb(crumbs: PageCrumb[]): void {
  // 只依赖稳定的 setter，避免随 context 值变化反复触发
  const setCrumbs = usePageBreadcrumb()?.setCrumbs;
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    if (!setCrumbs) {
      return;
    }
    setCrumbs(JSON.parse(key) as PageCrumb[]);
  }, [setCrumbs, key]);
  useEffect(() => {
    if (!setCrumbs) {
      return;
    }
    return () => setCrumbs([]);
  }, [setCrumbs]);
}