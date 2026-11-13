'use client';

import { cn } from '@/lib/utils';

// 页内 Tab（product/平台布局.md 聚合页 · 页内 Tab）：
// 只切换页面内容区，不新增顶部多标签页；样式为下划线式，与顶栏标签区分。

export interface TabItem {
  value: string;
  label: string;
}

export function Tabs({
  value,
  items,
  onValueChange,
}: {
  value: string;
  items: TabItem[];
  onValueChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div role="tablist" className="flex shrink-0 items-center gap-4 border-b border-border">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              '-mb-px border-b-2 px-1 py-2 text-sm transition-colors',
              active
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onValueChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
