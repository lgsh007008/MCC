'use client';

import Link from 'next/link';
import { SearchIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';

// 移动列表共用件（design/平台布局.md §1.5 / §1.8）：销售单、客户档案等所有移动列表
// 强制复用同一套页面骨架、搜索框、卡片、加载更多与空态，避免各页复制导致样式漂移。

// 列表页骨架：顶部栏 + 可选搜索区 + 列表区 + 可选底部主操作条。
// 主操作（新建）固定在底部；顶部栏右侧只放非主操作（如入口页退出）。
export function MobileListPage({
  title,
  backHref,
  search,
  action,
  children,
}: {
  title: string;
  backHref?: string;
  search?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={action ? 'pb-24' : undefined}>
      <MobileHeader title={title} backHref={backHref} />
      <div className="space-y-3 p-4">
        {search}
        {children}
      </div>
      {action ? <MobileActionBar>{action}</MobileActionBar> : null}
    </div>
  );
}

export function MobileListSearch({
  value,
  onChange,
  onSearch,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  /** 传字符串表示按指定值立即搜索（如清除时传空串），不传则用当前输入值 */
  onSearch: (value?: string) => void;
  placeholder: string;
}): React.ReactElement {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          enterKeyHint="search"
          className="h-12 pr-11 pl-9 text-base"
        />
        {value ? (
          <button
            type="button"
            aria-label="清除搜索"
            className="absolute top-1/2 right-1 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            onClick={() => {
              onChange('');
              onSearch('');
            }}
          >
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function MobileListCard({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border bg-card p-4 hover:bg-muted/60"
    >
      {children}
    </Link>
  );
}

export function MobileListLoadMore({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-12 w-full text-base"
      disabled={loading}
      onClick={onClick}
    >
      {loading ? '加载中…' : '加载更多'}
    </Button>
  );
}

export function MobileListState({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'error';
}): React.ReactElement {
  return (
    <p
      className={
        tone === 'error'
          ? 'py-6 text-center text-base text-destructive'
          : 'py-6 text-center text-base text-muted-foreground'
      }
    >
      {children}
    </p>
  );
}
