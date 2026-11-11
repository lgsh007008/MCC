'use client';

import { cn } from '@/lib/utils';

// 表单页 / 详情页共用骨架（product/平台布局.md「表单页与详情页共用骨架」）：
// 标题区与底部操作区固定，中间内容区独立滚动；页面本身不再滚动。
export function PageFrame({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}): React.ReactElement {
  return (
    <div data-slot="page-frame" className={cn('flex h-full min-h-0 flex-col', className)}>
      <div data-slot="page-frame-header" className="shrink-0 pb-2">
        <h1 className="flex items-center gap-2 text-base font-semibold leading-tight">
          <span aria-hidden className="h-4 w-0.5 shrink-0 rounded-full bg-foreground/20" />
          <span className="min-w-0">{title}</span>
        </h1>
      </div>
      <div
        data-slot="page-frame-body"
        className={cn('scroll-area min-h-0 flex-1 overflow-y-auto py-2', bodyClassName)}
      >
        {children}
      </div>
      {actions ? (
        <div
          data-slot="page-frame-actions"
          className="shrink-0 border-t border-border bg-background pt-2 print:hidden"
        >
          <div className="flex flex-wrap gap-2">{actions}</div>
        </div>
      ) : null}
    </div>
  );
}
