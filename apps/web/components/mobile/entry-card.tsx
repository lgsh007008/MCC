'use client';

import Link from 'next/link';
import { ChevronRightIcon } from 'lucide-react';

// 移动入口卡片（product/平台布局.md 移动页 · 入口）：
// 图标 + 标题（title 角色）+ 一行说明（body 角色）+ 右箭头，整块可点。
// 入口页 /m 与二级入口页（如 /m/finance）共用；页面跳转不拿按钮承载。
export function MobileEntryCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}): React.ReactElement {
  return (
    <Link
      href={href}
      className="flex min-h-20 items-center gap-4 rounded-xl border border-border bg-card p-5 hover:bg-muted/60"
    >
      <Icon className="size-8 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-mobile-title font-medium">{title}</span>
        <span className="mt-1 block text-mobile-body text-muted-foreground">{description}</span>
      </span>
      <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
