'use client';

import Link from 'next/link';
import type { RefObject } from 'react';
import type { NavGroup } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { sidebarItemFocusClass, sidebarItemStateClass } from './sidebar-item-state';

// 折叠态当前分组的二级菜单浮层（product/平台布局.md R-平台布局-001 /
// design/平台布局.md §1.3）：固定覆盖在侧栏右侧，不推挤主内容；只展示当前分组。
export function SidebarPeek({
  group,
  currentHref,
  panelRef,
  onPointerEnter,
  onPointerLeave,
  onNavigate,
}: {
  group: NavGroup | null;
  currentHref?: string;
  panelRef: RefObject<HTMLDivElement | null>;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onNavigate: () => void;
}): React.ReactElement | null {
  if (!group) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      id="sidebar-peek-panel"
      className="fixed inset-y-0 left-[var(--sidebar-width-icon)] z-40 flex w-60 flex-col overflow-hidden border-r border-border bg-sidebar shadow-xl"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
      </div>
      <nav className="scroll-area min-h-0 flex-1 overflow-y-auto p-2" aria-label={`${group.label}菜单`}>
        <ul className="flex flex-col gap-0.5">
          {group.items.map((item) => {
            const active = item.href === currentHref;
            return (
              <li key={item.title}>
                <Link
                  href={item.href ?? '#'}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors',
                    sidebarItemStateClass({ selected: active }),
                    sidebarItemFocusClass,
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="truncate">{item.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
